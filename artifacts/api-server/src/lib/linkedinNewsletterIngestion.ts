import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  db,
  editorialItemsTable,
  type EditorialItem,
} from "@workspace/db";
import { logger } from "./logger";
import { hasDuplicateLinkedInNewsletterUrl } from "./editorialNewsletter";
import {
  APPROVED_LINKEDIN_SOURCE_URL,
  approvedLinkedInOrganizationName,
  buildLinkedInEditorialDraft,
  completeLinkedInNewsletterRecord,
  getNextLinkedInPageStart,
  parseLinkedInArticlePost,
  type LinkedInNewsletterRecord,
} from "./linkedinNewsletterMapping";

const LINKEDIN_API_ORIGIN = "https://api.linkedin.com";
const LINKEDIN_POSTS_PATH = "/rest/posts";
const DEFAULT_RUN_TIME_UTC = "02:00";
const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export type LinkedInIngestionReport = {
  sourceUrl: string;
  checkedAt: string;
  fetched: number;
  created: number;
  skipped: number;
  failed: number;
  drafts: Array<{ id: string; title: string; sourceId: string }>;
  errors: string[];
};

let lastRun: {
  startedAt: string;
  completedAt?: string;
  status: "running" | "succeeded" | "failed";
  report?: LinkedInIngestionReport;
  error?: string;
} | undefined;
let runningPromise: Promise<LinkedInIngestionReport> | undefined;

const slugify = (title: string) => {
  const slug = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180);
  return slug || "linkedin-newsletter";
};

const sourceHash = (sourceId: string) =>
  createHash("sha256").update(sourceId).digest("hex").slice(0, 10);

const responseRecords = (body: unknown): unknown[] => {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  const object = body as Record<string, unknown>;
  if (Array.isArray(object.elements)) return object.elements;
  if (Array.isArray(object.data)) return object.data;
  if (object.data && typeof object.data === "object") {
    const nested = object.data as Record<string, unknown>;
    if (Array.isArray(nested.elements)) return nested.elements;
  }
  return [];
};

const config = () => {
  const sourceUrl = process.env.LINKEDIN_NEWSLETTER_SOURCE_URL || APPROVED_LINKEDIN_SOURCE_URL;
  if (sourceUrl !== APPROVED_LINKEDIN_SOURCE_URL) {
    throw new Error("LINKEDIN_NEWSLETTER_SOURCE_URL must match the approved Könsälidön LinkedIn page");
  }
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const organizationId = process.env.LINKEDIN_ORGANIZATION_ID;
  if (!accessToken) throw new Error("LINKEDIN_ACCESS_TOKEN is not configured");
  if (!organizationId || !/^\d+$/.test(organizationId)) {
    throw new Error("LINKEDIN_ORGANIZATION_ID is not configured with a numeric organization ID");
  }
  return { sourceUrl, accessToken, organizationId };
};

const linkedInHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: "application/json",
  "LinkedIn-Version": process.env.LINKEDIN_API_VERSION || "202607",
  "X-Restli-Protocol-Version": "2.0.0",
});

const fetchLinkedInJson = async (
  url: URL,
  accessToken: string,
  stage: string,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> => {
  const response = await fetch(url, {
    headers: { ...linkedInHeaders(accessToken), ...extraHeaders },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${stage}: LinkedIn API returned HTTP ${response.status} for ${url.pathname}`);
  }
  return response.json() as Promise<unknown>;
};

const verifyApprovedOrganization = async (
  organizationId: string,
  accessToken: string,
): Promise<string> => {
  const url = new URL(`/rest/organizations/${organizationId}`, LINKEDIN_API_ORIGIN);
  const organization = await fetchLinkedInJson(url, accessToken, "organization verification");
  const name = approvedLinkedInOrganizationName(organization);
  if (!name) {
    throw new Error(
      "organization verification: LINKEDIN_ORGANIZATION_ID does not match the approved Könsälidön page",
    );
  }
  return name;
};

const fetchLinkedInImage = async (
  thumbnailUrn: string,
  accessToken: string,
): Promise<unknown> => {
  const url = new URL(`/rest/images/${thumbnailUrn}`, LINKEDIN_API_ORIGIN);
  return fetchLinkedInJson(url, accessToken, "article thumbnail");
};

const fetchNewsletterRecords = async (): Promise<{
  records: LinkedInNewsletterRecord[];
  rejected: number;
}> => {
  const { accessToken, organizationId } = config();
  const authorName = await verifyApprovedOrganization(organizationId, accessToken);
  const authorUrn = `urn:li:organization:${organizationId}`;

  const rawRecords: unknown[] = [];
  let start = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(LINKEDIN_POSTS_PATH, LINKEDIN_API_ORIGIN);
    url.searchParams.set("q", "author");
    url.searchParams.set("author", authorUrn);
    url.searchParams.set("viewContext", "READER");
    url.searchParams.set("start", String(start));
    url.searchParams.set("count", String(PAGE_SIZE));
    url.searchParams.set("sortBy", "CREATED");
    const body = await fetchLinkedInJson(
      url,
      accessToken,
      `organization posts page ${page + 1}`,
      { "X-RestLi-Method": "FINDER" },
    );
    const pageRecords = responseRecords(body);
    rawRecords.push(...pageRecords);
    const nextStart = getNextLinkedInPageStart(
      body,
      start,
      pageRecords.length,
      rawRecords.length,
      PAGE_SIZE,
    );
    if (nextStart === undefined) break;
    start = nextStart;
    if (page === MAX_PAGES - 1) {
      logger.warn({ maxPages: MAX_PAGES }, "LinkedIn newsletter pagination reached its safety limit");
    }
  }
  const articles = rawRecords
    .map((record) => parseLinkedInArticlePost(record, authorUrn))
    .filter((record): record is NonNullable<typeof record> => Boolean(record));
  const imageCache = new Map<string, unknown>();
  const records: LinkedInNewsletterRecord[] = [];
  for (const article of articles) {
    let image = imageCache.get(article.thumbnailUrn);
    if (!image) {
      try {
        image = await fetchLinkedInImage(article.thumbnailUrn, accessToken);
        imageCache.set(article.thumbnailUrn, image);
      } catch (error) {
        logger.warn(
          { err: error, sourceId: article.sourceId, stage: "thumbnail resolution" },
          "Skipped LinkedIn article whose thumbnail could not be resolved",
        );
        continue;
      }
    }
    const record = completeLinkedInNewsletterRecord(article, image, authorName);
    if (record) records.push(record);
  }
  return { records, rejected: rawRecords.length - records.length };
};

const createDraft = async (record: LinkedInNewsletterRecord): Promise<EditorialItem | undefined> =>
  db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext('editorial:newsletters'))`,
    );
    const existing = await transaction
      .select({
        id: editorialItemsTable.id,
        data: editorialItemsTable.data,
        sourceId: sql<string | null>`${editorialItemsTable}.source_id`,
      })
      .from(editorialItemsTable)
      .where(eq(editorialItemsTable.collection, "newsletters"));
    if (
      existing.some((item) => item.sourceId === record.sourceId)
      || hasDuplicateLinkedInNewsletterUrl(
        { url: record.sourceUrl, sourceUrl: record.sourceUrl },
        existing,
      )
    ) return undefined;

    const baseSlug = slugify(record.title);
    const slug = `${baseSlug}-${sourceHash(record.sourceId)}`;
    const [item] = await transaction
      .insert(editorialItemsTable)
      .values(buildLinkedInEditorialDraft(record, slug))
      .returning();
    return item;
  });

export const ingestLinkedInNewsletters = async (): Promise<LinkedInIngestionReport> => {
  if (runningPromise) return runningPromise;
  runningPromise = (async () => {
    const startedAt = new Date().toISOString();
    lastRun = { startedAt, status: "running" };
    const report: LinkedInIngestionReport = {
      sourceUrl: APPROVED_LINKEDIN_SOURCE_URL,
      checkedAt: startedAt,
      fetched: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      drafts: [],
      errors: [],
    };
    try {
      const { records, rejected } = await fetchNewsletterRecords();
      report.fetched = records.length + rejected;
      report.skipped = rejected;
      if (rejected) {
        report.errors.push(
          `${rejected} API record(s) were skipped because they were not evidenced newsletters or lacked required metadata`,
        );
        logger.warn(
          { rejected },
          "Skipped LinkedIn API records without complete evidenced newsletter metadata",
        );
      }
      for (const record of records) {
        try {
          const item = await createDraft(record);
          if (!item) {
            report.skipped += 1;
            continue;
          }
          report.created += 1;
          report.drafts.push({ id: item.id, title: item.title, sourceId: record.sourceId });
        } catch (error) {
          report.failed += 1;
          report.errors.push(`${record.sourceId}: ${error instanceof Error ? error.message : "unknown error"}`);
          logger.error(
            { err: error, sourceId: record.sourceId, stage: "draft creation" },
            "Failed to create LinkedIn newsletter draft",
          );
        }
      }
      lastRun = { startedAt, completedAt: new Date().toISOString(), status: "succeeded", report };
      logger.info(
        { fetched: report.fetched, created: report.created, skipped: report.skipped, failed: report.failed },
        "LinkedIn newsletter ingestion completed",
      );
      return report;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      report.failed = 1;
      report.errors.push(message);
      lastRun = { startedAt, completedAt: new Date().toISOString(), status: "failed", report, error: message };
      logger.error(
        { err: error, stage: "source fetch or validation" },
        "LinkedIn newsletter ingestion failed",
      );
      throw error;
    } finally {
      runningPromise = undefined;
    }
  })();
  return runningPromise;
};

export const getLinkedInNewsletterIngestionStatus = () => ({
  sourceUrl: APPROVED_LINKEDIN_SOURCE_URL,
  configured: Boolean(
    process.env.LINKEDIN_ACCESS_TOKEN
    && process.env.LINKEDIN_ORGANIZATION_ID
    && /^\d+$/.test(process.env.LINKEDIN_ORGANIZATION_ID),
  ),
  apiUrlConfigured: true,
  scheduleUtc: process.env.LINKEDIN_NEWSLETTER_RUN_TIME_UTC || DEFAULT_RUN_TIME_UTC,
  lastRun,
});

const millisecondsUntilNextRun = (runTime: string) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(runTime);
  const [hours, minutes] = match ? [Number(match[1]), Number(match[2])] : [2, 0];
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hours, minutes, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
};

export const startLinkedInNewsletterScheduler = () => {
  if (!getLinkedInNewsletterIngestionStatus().configured) {
    logger.info("LinkedIn newsletter scheduler disabled because API credentials are not configured");
    return false;
  }
  const runTime = process.env.LINKEDIN_NEWSLETTER_RUN_TIME_UTC || DEFAULT_RUN_TIME_UTC;
  const scheduleNext = () => {
    const delay = millisecondsUntilNextRun(runTime);
    setTimeout(async () => {
      try {
        await ingestLinkedInNewsletters();
      } catch {
        // The ingestion function has already logged the actionable failure.
      }
      scheduleNext();
    }, delay).unref();
  };
  scheduleNext();
  logger.info({ runTimeUtc: runTime, sourceUrl: APPROVED_LINKEDIN_SOURCE_URL }, "LinkedIn newsletter scheduler started");
  return true;
};
