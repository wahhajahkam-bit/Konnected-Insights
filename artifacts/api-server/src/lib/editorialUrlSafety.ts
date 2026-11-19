import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeSourceUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeSourceUrlError";
  }
}

export type PinnedSourceTarget = {
  url: URL;
  address: string;
  family: 4 | 6;
};

export type SourceAddressLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const ipv4Number = (address: string) => {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return (((parts[0]! * 256 + parts[1]!) * 256 + parts[2]!) * 256 + parts[3]!) >>> 0;
};

const inV4Range = (value: number, base: string, prefix: number) => {
  const baseValue = ipv4Number(base)!;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) >>> 0 === (baseValue & mask) >>> 0;
};

export const isPublicIpAddress = (rawAddress: string): boolean => {
  const address = rawAddress.replace(/^\[|\]$/g, "").split("%")[0]!.toLowerCase();
  if (isIP(address) === 4) {
    const value = ipv4Number(address)!;
    return ![
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
      ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
      ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
      ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ].some(([base, prefix]) => inV4Range(value, base as string, prefix as number));
  }
  if (isIP(address) !== 6) return false;

  const mapped = address.match(/^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpAddress(mapped[1]!);
  // Globally routable unicast is 2000::/3. Documentation space remains non-public.
  const first = Number.parseInt(address.split(":")[0] || "0", 16);
  if (first < 0x2000 || first > 0x3fff) return false;
  return !address.startsWith("2001:db8:");
};

export const parsePublicSourceUrl = (input: string): URL => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeSourceUrlError("Source URL is invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeSourceUrlError("Source URL must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new UnsafeSourceUrlError("Source URL must not contain credentials");
  }
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    throw new UnsafeSourceUrlError("Source URL uses a nonstandard port");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new UnsafeSourceUrlError("Source URL host is not public");
  }
  if (isIP(hostname) && !isPublicIpAddress(hostname)) {
    throw new UnsafeSourceUrlError("Source URL address is not public");
  }
  return url;
};

export const validatePublicSourceUrl = async (
  input: string,
  resolve: SourceAddressLookup = (hostname) => lookup(hostname, { all: true, verbatim: true }),
): Promise<PinnedSourceTarget> => {
  const url = parsePublicSourceUrl(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    if (!isPublicIpAddress(hostname)) throw new UnsafeSourceUrlError("Source URL address is not public");
    return { url, address: hostname, family: isIP(hostname) as 4 | 6 };
  }
  {
    let addresses;
    try {
      addresses = await resolve(hostname);
    } catch {
      throw new UnsafeSourceUrlError("Source URL host could not be resolved");
    }
    if (!addresses.length || addresses.some(({ address }) => !isPublicIpAddress(address))) {
      throw new UnsafeSourceUrlError("Source URL host resolves to a non-public address");
    }
    const address = addresses[0]!;
    if (address.family !== 4 && address.family !== 6) {
      throw new UnsafeSourceUrlError("Source URL host resolved to an invalid address");
    }
    return { url, address: address.address, family: address.family };
  }
};

export const normalizeEditorialSlug = (input: string) =>
  input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 200).replace(/-+$/g, "") || "untitled";

export const normalizeYouTubeVideoId = (input: string): string | null => {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let candidate: string | null = null;
    if (host === "youtu.be") candidate = url.pathname.split("/")[1] ?? null;
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      candidate = url.searchParams.get("v");
      if (!candidate) {
        const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/);
        candidate = match?.[1] ?? null;
      }
    }
    return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
};

export const normalizeLinkedInArticleUrl = (input: unknown): string | null => {
  if (typeof input !== "string") return null;
  try {
    const url = new URL(input.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (
      !["http:", "https:"].includes(url.protocol)
      || host !== "linkedin.com"
      || !/^\/(?:pulse|newsletter|article|posts)\//i.test(url.pathname)
    ) {
      return null;
    }
    const pathname = url.pathname.replace(/\/+/g, "/").replace(/\/+$/, "") || "/";
    return `https://linkedin.com${pathname}`;
  } catch {
    return null;
  }
};