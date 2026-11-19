export const APPROVED_LINKEDIN_SOURCE_URL =
  "https://www.linkedin.com/company/kons%C3%A4lid%C3%B6n/posts/?feedView=all";
const APPROVED_COMPANY_VANITY_NAME = "konsälidön";
export const APPROVED_NEWSLETTER_CATEGORY = "Könsälidön Newsletter";

export type LinkedInNewsletterRecord = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  excerpt: string;
  image: string;
  author: { name: string };
  category: string;
  publishedAt?: string;
};

export type LinkedInArticlePost = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  excerpt: string;
  thumbnailUrn: string;
  publishedAt?: string;
};

export type LinkedInEditorialDraftValues = {
  collection: "newsletters";
  slug: string;
  title: string;
  status: "draft";
  sourceId: string;
  data: {
    category: string;
    excerpt: string;
    url: string;
    image: string;
    author: { name: string };
    sourceId: string;
    sourceUrl: string;
    publishedAt?: string;
  };
};

type RawRecord = Record<string, unknown>;

const nested = (record: RawRecord, keys: string[]): unknown => {
  let current: unknown = record;
  for (const key of keys) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as RawRecord)[key];
  }
  return current;
};

const stringAt = (record: RawRecord, keys: string[]): string | undefined => {
  const value = nested(record, keys);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const absoluteHttpUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

const normalizedIdentity = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("en");

export const approvedLinkedInOrganizationName = (raw: unknown): string | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as RawRecord;
  const vanityName = stringAt(record, ["vanityName"]);
  if (
    !vanityName
    || normalizedIdentity(vanityName) !== normalizedIdentity(APPROVED_COMPANY_VANITY_NAME)
  ) {
    return undefined;
  }
  return stringAt(record, ["localizedName"]) || stringAt(record, ["name"]);
};

export const parseLinkedInArticlePost = (
  raw: unknown,
  expectedAuthorUrn: string,
): LinkedInArticlePost | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as RawRecord;
  if (
    stringAt(record, ["lifecycleState"]) !== "PUBLISHED"
    || stringAt(record, ["visibility"]) !== "PUBLIC"
    || stringAt(record, ["author"]) !== expectedAuthorUrn
  ) {
    return undefined;
  }
  const sourceId = stringAt(record, ["id"]);
  const sourceUrl = absoluteHttpUrl(stringAt(record, ["content", "article", "source"]));
  const title = stringAt(record, ["content", "article", "title"]);
  const excerpt = stringAt(record, ["content", "article", "description"]);
  const thumbnailUrn = stringAt(record, ["content", "article", "thumbnail"]);
  const publishedAtValue = nested(record, ["publishedAt"]);
  if (
    !sourceId
    || !sourceUrl
    || !title
    || !excerpt
    || !thumbnailUrn
    || !/^urn:li:image:[A-Za-z0-9_-]+$/.test(thumbnailUrn)
  ) {
    return undefined;
  }
  const publishedAt = typeof publishedAtValue === "number"
    ? new Date(publishedAtValue).toISOString()
    : undefined;
  return {
    sourceId: `linkedin:${sourceId}`,
    sourceUrl,
    title,
    excerpt,
    thumbnailUrn,
    ...(publishedAt ? { publishedAt } : {}),
  };
};

export const completeLinkedInNewsletterRecord = (
  article: LinkedInArticlePost,
  image: unknown,
  authorName: string,
): LinkedInNewsletterRecord | undefined => {
  if (!image || typeof image !== "object") return undefined;
  const imageUrl = absoluteHttpUrl(stringAt(image as RawRecord, ["downloadUrl"]));
  if (!imageUrl) return undefined;
  return {
    sourceId: article.sourceId,
    sourceUrl: article.sourceUrl,
    title: article.title,
    excerpt: article.excerpt,
    image: imageUrl,
    author: { name: authorName },
    category: APPROVED_NEWSLETTER_CATEGORY,
    ...(article.publishedAt ? { publishedAt: article.publishedAt } : {}),
  };
};

export const buildLinkedInEditorialDraft = (
  record: LinkedInNewsletterRecord,
  slug: string,
): LinkedInEditorialDraftValues => ({
  collection: "newsletters",
  slug,
  title: record.title,
  status: "draft",
  sourceId: record.sourceId,
  data: {
    category: record.category,
    excerpt: record.excerpt,
    url: record.sourceUrl,
    image: record.image,
    author: record.author,
    sourceId: record.sourceId,
    sourceUrl: record.sourceUrl,
    ...(record.publishedAt ? { publishedAt: record.publishedAt } : {}),
  },
});

export const getNextLinkedInPageStart = (
  body: unknown,
  currentStart: number,
  receivedCount: number,
  fetchedCount: number,
  pageSize: number,
): number | undefined => {
  if (body && typeof body === "object") {
    const paging = (body as RawRecord).paging;
    if (paging && typeof paging === "object") {
      const pagingRecord = paging as RawRecord;
      const links = pagingRecord.links;
      if (Array.isArray(links)) {
        const nextLink = links.find((link) =>
          link
          && typeof link === "object"
          && stringAt(link as RawRecord, ["rel"])?.toLowerCase() === "next"
        );
        const href = nextLink && typeof nextLink === "object"
          ? stringAt(nextLink as RawRecord, ["href"])
          : undefined;
        if (href) {
          try {
            const nextStart = Number(new URL(href, "https://api.linkedin.com").searchParams.get("start"));
            if (Number.isInteger(nextStart) && nextStart > currentStart) return nextStart;
          } catch {
            return undefined;
          }
        }
      }
      const total = pagingRecord.total;
      if (typeof total === "number" && fetchedCount >= total) return undefined;
    }
  }
  if (receivedCount === 0 || receivedCount < pageSize) return undefined;
  return currentStart + receivedCount;
};