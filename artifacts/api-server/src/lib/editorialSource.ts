import http, { type RequestOptions } from "node:http";
import https from "node:https";
import { Buffer } from "node:buffer";
import { validatePublicSourceUrl, type PinnedSourceTarget } from "./editorialUrlSafety";

export type EditorialSource = {
  contentType?: string;
  url: string;
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  author?: string;
  date?: string;
  text: string;
};

export class UnsupportedEditorialFormat extends Error {
  constructor(public readonly url: string, public readonly contentType: string) {
    super("Source must be HTML or plain text; PDF and other formats are not supported");
  }
}

const decode = (value: string) => value
  .replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const clean = (value = "") => decode(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
const attr = (tag: string, name: string) => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3];
};
const meta = (html: string, names: string[]) => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "itemprop"))?.toLowerCase();
    if (key && names.includes(key)) return clean(attr(tag, "content"));
  }
  return "";
};
// Publication metadata, never a guessed date from search snippets or a footer.
const structuredPublicationDate = (html: string): string => {
  const find = (value: unknown, depth = 0): string => {
    if (!value || typeof value !== "object" || depth > 8) return "";
    if (Array.isArray(value)) return value.map(v => find(v,depth+1)).find(Boolean) ?? "";
    const object = value as Record<string, unknown>;
    if (typeof object.datePublished === "string") return object.datePublished;
    return object["@graph"] ? find(object["@graph"],depth+1) : "";
  };
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const date = find(JSON.parse(match[1])); if (date) return clean(date); } catch { /* malformed metadata is not evidence */ }
  }
  return "";
};
const absolute = (value: string, base: URL) => {
  try {
    const result = new URL(value, base);
    return ["http:", "https:"].includes(result.protocol) ? result.toString() : undefined;
  } catch { return undefined; }
};

export const extractEditorialSource = (body: string, contentType: string, url: URL): EditorialSource => {
  if (!contentType.includes("html")) {
    const text = clean(body).slice(0, 60_000);
    return { url: url.toString(), title: url.hostname, description: text.slice(0, 500), text };
  }
  const title = meta(body, ["og:title", "twitter:title"]) ||
    clean(body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || url.hostname;
  const description = meta(body, ["description", "og:description", "twitter:description"]);
  const image = absolute(meta(body, ["og:image", "twitter:image", "twitter:image:src"]), url);
  const author = meta(body, ["author", "article:author", "byl"]);
  const date = meta(body, ["article:published_time", "datepublished", "date", "pubdate"]) || structuredPublicationDate(body);
  const canonicalTag = (body.match(/<link\b[^>]*>/gi) ?? []).find((tag) =>
    (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("canonical"));
  const canonical = canonicalTag ? absolute(attr(canonicalTag, "href") ?? "", url) : undefined;
  const visible = body.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|svg|noscript|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(?:p|div|section|article|main|h[1-6]|li|br)\b[^>]*>/gi, "\n");
  return { url: url.toString(), title, description, canonical, image, author, date, text: clean(visible).slice(0, 60_000) };
};

export const pinnedRequestOptions = (target: PinnedSourceTarget): RequestOptions => {
  const { url, address, family } = target;
  return {
    protocol: url.protocol,
    // Connect to the address that was validated; never let the HTTP client resolve
    // the hostname again after the safety check.
    hostname: address,
    family,
    port: url.port || undefined,
    path: `${url.pathname}${url.search}`,
    method: "GET",
    headers: {
      host: url.host,
      accept: "text/html,text/plain;q=0.9",
      "user-agent": "KonnectedInsightsEditorialBot/1.0",
    },
    lookup: (_hostname, _options, callback) => callback(null, address, family),
    ...(url.protocol === "https:" ? { servername: url.hostname.replace(/^\[|\]$/g, "") } : {}),
  };
};

export const requestPinnedSource = (target: PinnedSourceTarget) => new Promise<http.IncomingMessage>((resolve, reject) => {
  const client = target.url.protocol === "https:" ? https : http;
  const request = client.request(pinnedRequestOptions(target), resolve);
  request.setTimeout(8_000, () => request.destroy(new Error("Source request timed out")));
  request.once("error", reject);
  request.end();
});

export const fetchEditorialSource = async (input: string): Promise<EditorialSource> => {
  let target = await validatePublicSourceUrl(input);
  for (let redirects = 0; redirects <= 4; redirects++) {
    const response = await requestPinnedSource(target);
    if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
      const headerLocation = response.headers.location;
      const location = Array.isArray(headerLocation) ? headerLocation[0] : headerLocation;
      if (!location || redirects === 4) {
        response.destroy();
        throw new Error("Source returned too many or invalid redirects");
      }
      response.resume();
      target = await validatePublicSourceUrl(new URL(location, target.url).toString());
      continue;
    }
    if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
      response.destroy();
      throw new Error(`Source returned HTTP ${response.statusCode}`);
    }
    const type = String(response.headers["content-type"] ?? "").toLowerCase();
    if (!type.includes("text/html") && !type.includes("text/plain")) {
      response.destroy();
      throw new UnsupportedEditorialFormat(target.url.toString(), type);
    }
    const declared = Number(response.headers["content-length"] ?? 0);
    if (declared > 1_048_576) { response.destroy(); throw new Error("Source exceeds the 1 MB limit"); }
    const chunks: Buffer[] = [];
    let size = 0;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => response.destroy(new Error("Source response timed out")), 8_000);
      const finish = (callback: () => void) => () => {
        clearTimeout(timer);
        callback();
      };
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1_048_576) response.destroy(new Error("Source exceeds the 1 MB limit"));
        else chunks.push(chunk);
      });
      response.once("end", finish(resolve));
      response.once("error", finish(reject));
      response.once("close", () => clearTimeout(timer));
    });
    return { ...extractEditorialSource(Buffer.concat(chunks).toString("utf8"), type, target.url), contentType: type };
  }
  throw new Error("Source could not be fetched");
};

export const isLinkedInAuthenticationWall = (source: EditorialSource): boolean => {
  let isLinkedIn = false;
  try {
    isLinkedIn = /(^|\.)linkedin\.com$/i.test(new URL(source.url).hostname);
  } catch {
    return false;
  }
  if (!isLinkedIn) return false;
  const content = `${source.title}\n${source.description}\n${source.text}`.toLowerCase();
  const loginSignals = [
    "sign in to linkedin",
    "join linkedin",
    "linkedin login",
    "authwall",
    "new to linkedin",
    "agree & join linkedin",
  ];
  return loginSignals.some((signal) => content.includes(signal))
    || (/\bsign in\b/.test(content) && /\bjoin now\b/.test(content));
};