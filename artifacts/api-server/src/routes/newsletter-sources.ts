import { Router, type IRouter, type Response } from "express";
import {
  CheckNewsletterSourceParams,
  CheckNewsletterSourceResponse,
  CreateNewsletterSourceBody,
  CreateNewsletterSourceResponse,
  DeleteNewsletterSourceParams,
  ListNewsletterSourcesResponse,
  UpdateNewsletterSourceBody,
  UpdateNewsletterSourceParams,
  UpdateNewsletterSourceResponse,
} from "@workspace/api-zod";
import {
  db,
  editorialItemsTable,
  newsletterSourceRunsTable,
  newsletterSourcesTable,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { parsePublicSourceUrl } from "../lib/editorialUrlSafety";
import {
  getMailboxStatus,
  latestRunsBySource,
  NewsletterRunConflictError,
  NEWSLETTER_SCHEDULE_UTC,
  runNewsletterSource,
  scheduledAtForEnabled,
  serializeNewsletterSource,
} from "../lib/gmailNewsletterIngestion";
import { requireEditorialStaff } from "../middlewares/requireEditorialStaff";

const router: IRouter = Router();

const fail = (response: Response, status: 400 | 404 | 409 | 500, code: string, message: string) => {
  response.status(status).json({ error: { code, message } });
};

type SourceInput = {
  name: string;
  senderEmail: string;
  subjectKeywords: string[];
  instructions: string;
  referenceUrls: string[];
  contributorId: string;
  enabled: boolean;
  expectedVersion?: number;
};

const normalizedInput = (input: SourceInput) => {
  const value = {
    ...input,
    name: input.name.trim(),
    senderEmail: input.senderEmail.trim().toLowerCase(),
    subjectKeywords: [...new Set(input.subjectKeywords.map((entry) => entry.trim()).filter(Boolean))],
    instructions: input.instructions.trim(),
    referenceUrls: [...new Set(input.referenceUrls.map((entry) => parsePublicSourceUrl(entry).toString()))],
  };
  if (!value.subjectKeywords.length && !value.instructions && !value.referenceUrls.length) {
    throw new Error("At least one subject keyword, instruction, or reference URL is required");
  }
  return value;
};

const contributorExists = async (id: string) => {
  const [contributor] = await db.select({ id: editorialItemsTable.id })
    .from(editorialItemsTable)
    .where(and(
      eq(editorialItemsTable.id, id),
      eq(editorialItemsTable.collection, "contributors"),
    )).limit(1);
  return Boolean(contributor);
};

router.use("/newsletter-sources", requireEditorialStaff);

router.get("/newsletter-sources", async (_request, response): Promise<void> => {
  const [sources, lastRuns, mailbox] = await Promise.all([
    db.select().from(newsletterSourcesTable).orderBy(asc(newsletterSourcesTable.name)),
    latestRunsBySource(),
    getMailboxStatus(),
  ]);
  response.json(ListNewsletterSourcesResponse.parse({
    sources: sources.map((source) => serializeNewsletterSource(source, lastRuns.get(source.id))),
    scheduleUtc: NEWSLETTER_SCHEDULE_UTC,
    ...mailbox,
  }));
});

router.post("/newsletter-sources", async (request, response): Promise<void> => {
  const parsed = CreateNewsletterSourceBody.safeParse(request.body);
  if (!parsed.success) {
    fail(response, 400, "VALIDATION_ERROR", "Invalid newsletter source");
    return;
  }
  let input;
  try {
    input = normalizedInput(parsed.data as SourceInput);
  } catch (error) {
    fail(response, 400, "VALIDATION_ERROR", error instanceof Error ? error.message : "Invalid source");
    return;
  }
  if (!(await contributorExists(input.contributorId))) {
    fail(response, 400, "STALE_CONTRIBUTOR", "Selected contributor no longer exists");
    return;
  }
  const [source] = await db.insert(newsletterSourcesTable).values({
    ...input,
    nextRunAt: scheduledAtForEnabled(input.enabled),
  }).returning();
  response.status(201).json(CreateNewsletterSourceResponse.parse(
    serializeNewsletterSource(source!, undefined),
  ));
});

router.put("/newsletter-sources/:id", async (request, response): Promise<void> => {
  const params = UpdateNewsletterSourceParams.safeParse(request.params);
  const parsed = UpdateNewsletterSourceBody.safeParse(request.body);
  if (!params.success || !parsed.success) {
    fail(response, 400, "VALIDATION_ERROR", "Invalid newsletter source update");
    return;
  }
  let input;
  try {
    input = normalizedInput(parsed.data as SourceInput & { expectedVersion: number });
  } catch (error) {
    fail(response, 400, "VALIDATION_ERROR", error instanceof Error ? error.message : "Invalid source");
    return;
  }
  if (!(await contributorExists(input.contributorId))) {
    fail(response, 400, "STALE_CONTRIBUTOR", "Selected contributor no longer exists");
    return;
  }
  const { expectedVersion, ...changes } = input;
  if (expectedVersion === undefined) {
    fail(response, 400, "VALIDATION_ERROR", "expectedVersion is required");
    return;
  }
  const [source] = await db.update(newsletterSourcesTable).set({
    ...changes,
    version: expectedVersion + 1,
    updatedAt: new Date(),
    nextRunAt: scheduledAtForEnabled(changes.enabled),
  }).where(and(
    eq(newsletterSourcesTable.id, params.data.id),
    eq(newsletterSourcesTable.version, expectedVersion),
  )).returning();
  if (!source) {
    const [existing] = await db.select({ id: newsletterSourcesTable.id })
      .from(newsletterSourcesTable).where(eq(newsletterSourcesTable.id, params.data.id)).limit(1);
    fail(response, existing ? 409 : 404, existing ? "VERSION_CONFLICT" : "NOT_FOUND",
      existing ? "The source was modified by another request" : "Newsletter source not found");
    return;
  }
  const lastRuns = await latestRunsBySource();
  response.json(UpdateNewsletterSourceResponse.parse(
    serializeNewsletterSource(source, lastRuns.get(source.id)),
  ));
});

router.delete("/newsletter-sources/:id", async (request, response): Promise<void> => {
  const params = DeleteNewsletterSourceParams.safeParse(request.params);
  if (!params.success) {
    fail(response, 400, "VALIDATION_ERROR", "Invalid newsletter source id");
    return;
  }
  const deleted = await db.transaction(async (transaction) => {
    const [running] = await transaction.select({ id: newsletterSourceRunsTable.id })
      .from(newsletterSourceRunsTable)
      .where(and(
        eq(newsletterSourceRunsTable.sourceId, params.data.id),
        eq(newsletterSourceRunsTable.status, "running"),
      )).limit(1);
    if (running) return "running" as const;
    const [row] = await transaction.delete(newsletterSourcesTable)
      .where(eq(newsletterSourcesTable.id, params.data.id))
      .returning({ id: newsletterSourcesTable.id });
    return row;
  });
  if (deleted === "running") {
    fail(response, 409, "RUNNING", "Wait for the bounded source check to finish before deleting it");
    return;
  }
  if (!deleted) {
    fail(response, 404, "NOT_FOUND", "Newsletter source not found");
    return;
  }
  response.sendStatus(204);
});

router.post("/newsletter-sources/:id/check", async (request, response): Promise<void> => {
  const params = CheckNewsletterSourceParams.safeParse(request.params);
  if (!params.success) {
    fail(response, 400, "VALIDATION_ERROR", "Invalid newsletter source id");
    return;
  }
  try {
    const report = await runNewsletterSource(params.data.id, true);
    response.json(CheckNewsletterSourceResponse.parse(report));
  } catch (error) {
    if (error instanceof NewsletterRunConflictError) {
      fail(response, 409, "RUNNING", error.message);
      return;
    }
    fail(response, 404, "NOT_FOUND", "Newsletter source not found");
  }
});

export default router;