import { BlockList, isIP } from "node:net";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
type ClientRequest = {
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string };
};

function normalizedAddress(value: string): string | null {
  const input = value.trim();
  const normalized = input.toLowerCase().startsWith("::ffff:") && isIP(input.slice(7)) === 4
    ? input.slice(7) : input;
  return isIP(normalized) ? normalized : null;
}

/**
 * Trust exactly one forwarding hop, and only from an explicitly trusted socket
 * peer. Never select XFF's leftmost entry or use X-Real-IP. This assumes the
 * configured immediate proxy overwrites XFF or appends the real connecting IP.
 * Do not configure proxies that merely preserve caller-supplied XFF.
 */
export function createChatClientIdentity(
  trustedProxyCidrs: string[],
): (request: ClientRequest) => string {
  const trusted = new BlockList();
  for (const entry of trustedProxyCidrs) {
    const [raw, rawPrefix, ...extra] = entry.trim().split("/");
    const address = normalizedAddress(raw);
    const family = address && isIP(address) === 4 ? "ipv4" : "ipv6";
    const max = family === "ipv4" ? 32 : 128;
    if (!address || extra.length || (rawPrefix !== undefined && (!/^\d+$/.test(rawPrefix) || Number(rawPrefix) < 1 || Number(rawPrefix) > max))) {
      throw new Error("Invalid INSIGHTS_CHAT_TRUSTED_PROXY_CIDRS configuration");
    }
    if (rawPrefix === undefined) trusted.addAddress(address, family);
    else trusted.addSubnet(address, Number(rawPrefix), family);
  }
  return request => {
    const peer = normalizedAddress(request.socket.remoteAddress ?? "") ?? "unknown";
    if (peer === "unknown" || !trusted.check(peer, isIP(peer) === 4 ? "ipv4" : "ipv6")) return peer;
    const header = request.headers["x-forwarded-for"];
    // Duplicate headers, malformed/oversized chains, ports and non-IP tokens
    // fail closed. Rightmost value is the only value this one-hop policy trusts.
    if (typeof header !== "string" || header.length > 2048) return peer;
    const chain = header.split(",");
    if (chain.length > 16 || chain.some(value => !normalizedAddress(value))) return peer;
    return normalizedAddress(chain.at(-1)!) ?? peer;
  };
}

export function chatTrustedProxies(env: NodeJS.ProcessEnv): string[] {
  if (env.INSIGHTS_CHAT_TRUSTED_PROXY_CIDRS !== undefined) {
    return env.INSIGHTS_CHAT_TRUSTED_PROXY_CIDRS.split(",").map(value => value.trim()).filter(Boolean);
  }
  // Local Replit preview ingress can proxy from loopback. Non-loopback deployed
  // ingress must be explicitly configured; no documented stable Replit CIDR
  // list or header-rewrite guarantee was found, so never trust all private IPs.
  return env.REPLIT_DEV_DOMAIN && env.REPLIT_DEPLOYMENT !== "1" ? ["127.0.0.1", "::1"] : [];
}

export const chatClientCookieName = "insights_chat_client";
const cookieLifetimeSeconds = 7 * 24 * 60 * 60;
export class ChatIdentityConfigurationError extends Error {
  constructor() { super("Anonymous chat identity is not configured."); }
}

/**
 * Anonymous browser identity only: no account or conversation state. All
 * replicas must use the existing shared SESSION_SECRET. Clearing cookies can
 * reset a browser quota; durable global budgets remain the hard cost ceiling.
 */
export function resolveChatClientCookie(
  cookieHeader: string | undefined,
  secret: string | undefined,
  now = Date.now(),
): { identity: string; newCookie?: string } {
  if (!secret) throw new ChatIdentityConfigurationError();
  const sign = (payload: string) => createHmac("sha256", secret)
    .update(`insights-chat-client:${payload}`).digest("base64url");
  const nowSeconds = Math.floor(now / 1000);
  const cookies = cookieHeader && cookieHeader.length <= 8192
    ? cookieHeader.split(";").map(value => value.trim()).filter(value => value.startsWith(`${chatClientCookieName}=`))
    : [];
  if (cookies.length === 1) {
    const value = cookies[0].slice(chatClientCookieName.length + 1);
    const match = /^v1\.([A-Za-z0-9_-]{43})\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(value);
    if (match) {
      const [, id, expiry, signature] = match;
      const expected = sign(`v1.${id}.${expiry}`);
      if (Number(expiry) > nowSeconds && Number(expiry) <= nowSeconds + cookieLifetimeSeconds &&
          timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return { identity: `browser:${id}` };
      }
    }
  }
  const id = randomBytes(32).toString("base64url");
  const payload = `v1.${id}.${nowSeconds + cookieLifetimeSeconds}`;
  return { identity: `browser:${id}`, newCookie: `${payload}.${sign(payload)}` };
}

export function chatClientCookieOptions(env: NodeJS.ProcessEnv): CookieOptions {
  return {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production" || env.REPLIT_DEPLOYMENT === "1" || !!env.REPLIT_DEV_DOMAIN,
      path: "/api/insights-chat",
      maxAge: cookieLifetimeSeconds * 1000,
  };
}

export function anonymousChatClientIdentity(req: Request, res: Response): string {
  const result = resolveChatClientCookie(req.headers.cookie, process.env.SESSION_SECRET);
  if (result.newCookie) {
    res.cookie(chatClientCookieName, result.newCookie, chatClientCookieOptions(process.env));
  }
  return result.identity;
}