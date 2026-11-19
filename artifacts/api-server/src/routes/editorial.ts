import { Router, type IRouter, type Response } from "express";
import {
  db,
  editorialCollectionSchema,
  editorialItemsTable,
  createEditorialItemSchema,
  patchEditorialItemSchema,
  reorderEditorialItemsSchema,
  validateEditorialWriteData,
} from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { logger } from "../lib/logger";
import { normalizeEditorialWriteData } from "../lib/editorialWriteData";
import { EditorialImageStorageService } from "../lib/editorialImageStorage";
import { hasDuplicateLinkedInNewsletterUrl } from "../lib/editorialNewsletter";
import {
  getAuthenticatedUserId,
  getEditorialStaffAccess,
  requireEditorialStaff,
} from "../middlewares/requireEditorialStaff";

const router: IRouter = Router();
const storage = new EditorialImageStorageService();
const uuidSchema = z.string().uuid();
const includeDraftsSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

const failure = (
  response: Response,
  status: 400 | 404 | 409 | 500,
  code: string,
  message: string,
  details?: unknown,
) =>
  response.status(status).json({
    error: { code, message, ...(details === undefined ? {} : { details }) },
  });

const validationFailure = (response: Response, error: z.ZodError) =>
  failure(response, 400, "VALIDATION_ERROR", "Invalid request", error.issues);

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "23505";

router.get("/editorial", async (request, response) => {
  const query = z
    .object({
      collection: editorialCollectionSchema.optional(),
      includeDrafts: includeDraftsSchema,
    })
    .safeParse(request.query);
  if (!query.success) return validationFailure(response, query.error);
  if (query.data.includeDrafts) {
    const userId = getAuthenticatedUserId(request);
    if (!userId) return response.status(401).json({ error: "Unauthorized" });
    if (!(await getEditorialStaffAccess(userId)).allowed) {
      return response.status(403).json({
        error: { code: "STAFF_ACCESS_DENIED", message: "Editorial staff access is required" },
      });
    }
  }

  const filters = [
    ...(query.data.collection
      ? [eq(editorialItemsTable.collection, query.data.collection)]
      : []),
    ...(query.data.includeDrafts
      ? []
      : [eq(editorialItemsTable.status, "published" as const)]),
  ];
  const items = await db
    .select()
    .from(editorialItemsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      asc(editorialItemsTable.collection),
      asc(editorialItemsTable.sortOrder),
      asc(editorialItemsTable.title),
    );
  return response.json({ data: items });
});

router.get("/editorial/:collection/:slug", async (request, response) => {
  const params = z
    .object({
      collection: editorialCollectionSchema,
      slug: z.string().min(1),
      includeDrafts: includeDraftsSchema,
    })
    .safeParse({ ...request.params, includeDrafts: request.query.includeDrafts });
  if (!params.success) return validationFailure(response, params.error);
  if (params.data.includeDrafts) {
    const userId = getAuthenticatedUserId(request);
    if (!userId) return response.status(401).json({ error: "Unauthorized" });
    if (!(await getEditorialStaffAccess(userId)).allowed) {
      return response.status(403).json({
        error: { code: "STAFF_ACCESS_DENIED", message: "Editorial staff access is required" },
      });
    }
  }

  const conditions = [
    eq(editorialItemsTable.collection, params.data.collection),
    eq(editorialItemsTable.slug, params.data.slug),
    ...(params.data.includeDrafts
      ? []
      : [eq(editorialItemsTable.status, "published" as const)]),
  ];
  const [item] = await db
    .select()
    .from(editorialItemsTable)
    .where(and(...conditions))
    .limit(1);
  if (!item) return failure(response, 404, "NOT_FOUND", "Editorial item not found");
  return response.json({ data: item });
});

router.get("/editorial/access", async (request, response) => {
  const userId = getAuthenticatedUserId(request);
  if (!userId) return response.status(401).json({ error: "Unauthorized" });
  return response.json({ data: await getEditorialStaffAccess(userId) });
});

router.post("/editorial", requireEditorialStaff, async (request, response) => {
  const input = createEditorialItemSchema.safeParse(request.body);
  if (!input.success) return validationFailure(response, input.error);
  let normalizedData: Record<string, unknown>;
  try {
    normalizedData = await normalizeEditorialWriteData(
      input.data.collection,
      input.data.data,
      (fileId) => storage.verifyEditorialImagePurpose(fileId, "generated"),
    );
  } catch {
    return failure(response, 400, "INVALID_GENERATED_IMAGE", "Generated artwork is unavailable or invalid");
  }
  const data = validateEditorialWriteData(input.data.collection, normalizedData, input.data.status);
  if (!data.success) return validationFailure(response, data.error);
  try {
    const item = await db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`editorial:${input.data.collection}`}))`,
      );
      if (input.data.collection === "newsletters") {
        const newsletters = await transaction
          .select({ id: editorialItemsTable.id, data: editorialItemsTable.data })
          .from(editorialItemsTable)
          .where(eq(editorialItemsTable.collection, "newsletters"));
        if (hasDuplicateLinkedInNewsletterUrl(normalizedData, newsletters)) return undefined;
      }
      const [created] = await transaction
        .insert(editorialItemsTable)
        .values({ ...input.data, data: normalizedData })
        .returning();
      return created;
    });
    if (!item) {
      return failure(
        response,
        409,
        "DUPLICATE_NEWSLETTER_URL",
        "A newsletter with this canonical source URL already exists",
      );
    }
    return response.status(201).json({ data: item });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return failure(
        response,
        409,
        "DUPLICATE_SLUG",
        "An item with this collection and slug already exists",
      );
    }
    logger.error({ err: error }, "Failed to create editorial item");
    return failure(response, 500, "INTERNAL_ERROR", "Could not create editorial item");
  }
});

router.patch("/editorial/:id", requireEditorialStaff, async (request, response) => {
  const id = uuidSchema.safeParse(request.params.id);
  const input = patchEditorialItemSchema.safeParse(request.body);
  if (!id.success) return validationFailure(response, id.error);
  if (!input.success) return validationFailure(response, input.error);

  const { expectedVersion, ...changes } = input.data;
  const [existing] = await db
    .select()
    .from(editorialItemsTable)
    .where(eq(editorialItemsTable.id, id.data))
    .limit(1);
  if (!existing) return failure(response, 404, "NOT_FOUND", "Editorial item not found");
  if (existing.version !== expectedVersion) {
    return failure(response, 409, "VERSION_CONFLICT", "The item was modified by another request", {
      currentVersion: existing.version,
    });
  }
  const collection = changes.collection ?? existing.collection;
  const status = changes.status ?? existing.status;
  // Event edits replace the full payload so an editor can migrate a legacy
  // record without old year/date/stats fields being merged back in.
  const mergedData = collection === "events" && changes.data
    ? changes.data
    : { ...existing.data, ...(changes.data ?? {}) };
  let normalizedData: Record<string, unknown>;
  try {
    normalizedData = await normalizeEditorialWriteData(
      collection,
      mergedData,
      (fileId) => storage.verifyEditorialImagePurpose(fileId, "generated"),
    );
  } catch {
    return failure(response, 400, "INVALID_GENERATED_IMAGE", "Generated artwork is unavailable or invalid");
  }
  const data = validateEditorialWriteData(collection, normalizedData, status);
  if (!data.success) return validationFailure(response, data.error);

  try {
    const result = await db.transaction(async (transaction) => {
      if (collection === "newsletters") {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtext('editorial:newsletters'))`,
        );
        const newsletters = await transaction
          .select({ id: editorialItemsTable.id, data: editorialItemsTable.data })
          .from(editorialItemsTable)
          .where(eq(editorialItemsTable.collection, "newsletters"));
        if (hasDuplicateLinkedInNewsletterUrl(normalizedData, newsletters, id.data)) {
          return { kind: "duplicate" as const };
        }
      }
      const [item] = await transaction
        .update(editorialItemsTable)
        .set({
          ...changes,
          data: normalizedData,
          version: expectedVersion + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(editorialItemsTable.id, id.data),
            eq(editorialItemsTable.version, expectedVersion),
          ),
        )
        .returning();
      return item ? { kind: "updated" as const, item } : { kind: "conflict" as const };
    });
    if (result.kind === "updated") return response.json({ data: result.item });
    if (result.kind === "duplicate") {
      return failure(
        response,
        409,
        "DUPLICATE_NEWSLETTER_URL",
        "A newsletter with this canonical source URL already exists",
      );
    }
    return failure(response, 409, "VERSION_CONFLICT", "The item was modified by another request");
  } catch (error) {
    if (isUniqueViolation(error)) {
      return failure(
        response,
        409,
        "DUPLICATE_SLUG",
        "An item with this collection and slug already exists",
      );
    }
    logger.error({ err: error }, "Failed to update editorial item");
    return failure(response, 500, "INTERNAL_ERROR", "Could not update editorial item");
  }
});

router.delete("/editorial/:id", requireEditorialStaff, async (request, response) => {
  const parsed = z
    .object({
      id: z.string().uuid(),
      expectedVersion: z.coerce.number().int().positive(),
    })
    .safeParse({
      id: request.params.id,
      expectedVersion: request.query.expectedVersion ?? request.body?.expectedVersion,
    });
  if (!parsed.success) return validationFailure(response, parsed.error);

  const [item] = await db
    .delete(editorialItemsTable)
    .where(
      and(
        eq(editorialItemsTable.id, parsed.data.id),
        eq(editorialItemsTable.version, parsed.data.expectedVersion),
      ),
    )
    .returning();
  if (item) return response.json({ data: item });

  const [existing] = await db
    .select({ version: editorialItemsTable.version })
    .from(editorialItemsTable)
    .where(eq(editorialItemsTable.id, parsed.data.id))
    .limit(1);
  return existing
    ? failure(response, 409, "VERSION_CONFLICT", "The item was modified by another request", {
        currentVersion: existing.version,
      })
    : failure(response, 404, "NOT_FOUND", "Editorial item not found");
});

router.patch("/editorial/:id/mark-ended", requireEditorialStaff, async (request, response) => {
  const id = uuidSchema.safeParse(request.params.id);
  const input = z.object({ expectedVersion: z.number().int().positive() }).strict().safeParse(request.body);
  if (!id.success) return validationFailure(response, id.error);
  if (!input.success) return validationFailure(response, input.error);

  const [existing] = await db
    .select()
    .from(editorialItemsTable)
    .where(eq(editorialItemsTable.id, id.data))
    .limit(1);
  if (!existing) return failure(response, 404, "NOT_FOUND", "Editorial item not found");
  if (existing.collection !== "events") {
    return failure(response, 400, "INVALID_COLLECTION", "Only events can be marked as ended");
  }
  if (existing.version !== input.data.expectedVersion) {
    return failure(response, 409, "VERSION_CONFLICT", "The item was modified by another request", {
      currentVersion: existing.version,
    });
  }

  const currentData = existing.data as Record<string, unknown>;
  const startAt = typeof currentData.startAt === "string" ? new Date(currentData.startAt).getTime() : NaN;
  const endedAt = new Date();
  if (!Number.isFinite(startAt)) {
    return failure(response, 400, "EVENT_START_REQUIRED", "Add a valid event start time before marking it ended");
  }
  if (startAt > endedAt.getTime()) {
    return failure(response, 400, "EVENT_NOT_STARTED", "A future event cannot be marked as ended");
  }

  const nextData: Record<string, unknown> = { ...currentData, endAt: endedAt.toISOString() };
  delete nextData.completionMode;
  const valid = validateEditorialWriteData("events", nextData, existing.status);
  if (!valid.success) return validationFailure(response, valid.error);

  const [item] = await db
    .update(editorialItemsTable)
    .set({
      data: nextData,
      version: existing.version + 1,
      updatedAt: endedAt,
    })
    .where(and(
      eq(editorialItemsTable.id, existing.id),
      eq(editorialItemsTable.version, existing.version),
    ))
    .returning();
  if (!item) return failure(response, 409, "VERSION_CONFLICT", "The item was modified by another request");
  return response.json({ data: item });
});

router.post("/editorial/reorder", requireEditorialStaff, async (request, response) => {
  const input = reorderEditorialItemsSchema.safeParse(request.body);
  if (!input.success) return validationFailure(response, input.error);

  const result = await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`editorial:${input.data.collection}`}))`,
    );
    const current = await transaction
      .select({ id: editorialItemsTable.id, version: editorialItemsTable.version })
      .from(editorialItemsTable)
      .where(eq(editorialItemsTable.collection, input.data.collection))
      .for("update");
    const currentIds = new Set(current.map(({ id }) => id));
    const requestedIds = new Set(input.data.items.map(({ id }) => id));
    const missingIds = current.map(({ id }) => id).filter((id) => !requestedIds.has(id));
    const extraIds = input.data.items.map(({ id }) => id).filter((id) => !currentIds.has(id));
    if (missingIds.length || extraIds.length) {
      return { kind: "invalid" as const, missingIds, extraIds };
    }

    const versions = new Map(current.map((item) => [item.id, item.version]));
    const stale = input.data.items
      .filter(({ id, expectedVersion }) => versions.get(id) !== expectedVersion)
      .map(({ id, expectedVersion }) => ({ id, expectedVersion, currentVersion: versions.get(id) }));
    if (stale.length) return { kind: "conflict" as const, stale };

    const updated = [];
    for (const [sortOrder, { id, expectedVersion }] of input.data.items.entries()) {
      const [item] = await transaction
        .update(editorialItemsTable)
        .set({
          sortOrder,
          version: sql`${editorialItemsTable.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(editorialItemsTable.id, id),
            eq(editorialItemsTable.collection, input.data.collection),
            eq(editorialItemsTable.version, expectedVersion),
          ),
        )
        .returning();
      if (item) updated.push(item);
    }
    return { kind: "updated" as const, updated };
  });
  if (result.kind === "invalid") {
    return failure(response, 400, "INVALID_IDS", "Some IDs do not belong to the collection", {
      missingIds: result.missingIds,
      extraIds: result.extraIds,
    });
  }
  if (result.kind === "conflict") {
    return failure(response, 409, "VERSION_CONFLICT", "One or more items were reordered by another request", {
      stale: result.stale,
    });
  }
  return response.json({ data: result.updated });
});

export default router;
