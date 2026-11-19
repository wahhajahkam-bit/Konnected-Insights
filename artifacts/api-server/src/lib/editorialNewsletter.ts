import { normalizeLinkedInArticleUrl } from "./editorialUrlSafety";

export type NewsletterUrlData = Record<string, unknown> | null | undefined;

export const newsletterUrlFromData = (data: NewsletterUrlData): string | undefined => {
  if (!data) return undefined;
  for (const key of ["url", "sourceUrl"] as const) {
    const value = data[key];
    if (typeof value === "string" && normalizeNewsletterUrl(value)) return value;
  }
  return undefined;
};

export const normalizeNewsletterUrl = (input: unknown): string | null => {
  if (typeof input !== "string") return null;
  try {
    const url = new URL(input.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const linkedInArticle = normalizeLinkedInArticleUrl(input);
    if (linkedInArticle) return linkedInArticle;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+/g, "/").replace(/\/+$/, "") || "/";
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
};

export const hasDuplicateLinkedInNewsletterUrl = (
  candidateData: NewsletterUrlData,
  existing: Array<{ id: string; data: unknown }>,
  excludedId?: string,
): boolean => {
  const candidate = newsletterUrlFromData(candidateData);
  const normalizedCandidate = normalizeNewsletterUrl(candidate);
  if (!normalizedCandidate) return false;
  return existing.some((item) => {
    if (item.id === excludedId || !item.data || typeof item.data !== "object" || Array.isArray(item.data)) {
      return false;
    }
    const data = item.data as Record<string, unknown>;
    return ["url", "sourceUrl"].some((key) =>
      normalizeNewsletterUrl(data[key]) === normalizedCandidate
    );
  });
};

export const hasDuplicateNewsletterUrl = hasDuplicateLinkedInNewsletterUrl;