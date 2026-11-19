import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const editorialCollections = [
  "newsletters",
  "masterclasses",
  "future-work",
  "events",
  "talks",
  "contributors",
  "communities",
] as const;
export const editorialStatuses = ["draft", "published"] as const;

export const editorialCollectionEnum = pgEnum(
  "editorial_collection",
  editorialCollections,
);
export const editorialStatusEnum = pgEnum(
  "editorial_status",
  editorialStatuses,
);

export const editorialItemsTable = pgTable(
  "editorial_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    collection: editorialCollectionEnum("collection").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    sourceId: text("source_id"),
    status: editorialStatusEnum("status").default("draft").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("editorial_items_collection_slug_unique").on(
      table.collection,
      table.slug,
    ),
    uniqueIndex("editorial_items_source_id_unique").on(table.sourceId),
  ],
);

export const editorialCollectionSchema = z.enum(editorialCollections);
export const editorialStatusSchema = z.enum(editorialStatuses);
export const editorialDataSchema = z
  .record(z.string(), z.unknown())
  .superRefine((data, context) => {
    const inspect = (value: unknown, key: string, path: PropertyKey[]) => {
      if (typeof value === "string") {
        // Empty optional metadata is not a URL or media reference.
        if (!value.trim()) return;
        const isUrl = /(url|href|link)$/i.test(key);
        const isMedia = /(images?|img|media|thumbnail|gallery)$/i.test(key);
        if (isUrl && !/^https?:\/\/\S+$/i.test(value)) {
          context.addIssue({
            code: "custom",
            message: "URL fields must be absolute http(s) URLs",
            path,
          });
        }
        if (
          isMedia &&
          !/^https?:\/\/\S+$/i.test(value) &&
          !/^\/(?!\/)\S+/.test(value)
        ) {
          context.addIssue({
            code: "custom",
            message: "Media fields must be absolute http(s) URLs or root-relative paths",
            path,
          });
        }
      } else if (Array.isArray(value)) {
        value.forEach((entry, index) => inspect(entry, key, [...path, index]));
      } else if (value && typeof value === "object") {
        Object.entries(value).forEach(([childKey, child]) =>
          inspect(child, childKey, [...path, childKey]),
        );
      }
    };
    Object.entries(data).forEach(([key, value]) => inspect(value, key, [key]));
  });

const httpUrl = z.string().url().refine((value) => /^https?:\/\//i.test(value), {
  message: "Must be an absolute http(s) URL",
});
const mediaUrl = z
  .string()
  .refine(
    (value) => /^https?:\/\/\S+$/i.test(value) || /^\/(?!\/)\S+/.test(value),
    "Must be an absolute http(s) URL or root-relative path",
  );
const authorSchema = z.object({ name: z.string().min(1).optional(), image: mediaUrl.optional() }).passthrough();
const isoDateTimeWithOffset = z.string().datetime({ offset: true });
const ianaTimeZone = z.string().min(1).refine((value) => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Must be a valid IANA time zone");
const eventFormat = z.enum(["in-person", "online", "hybrid"]);
const validateModernEventFields = (
  event: { startAt?: string; endAt?: string } & Record<string, unknown>,
  context: z.RefinementCtx,
) => {
  if (event.startAt && event.endAt && new Date(event.endAt).getTime() < new Date(event.startAt).getTime()) {
    context.addIssue({
      code: "custom",
      path: ["endAt"],
      message: "Event end time must not be before its start time",
      input: event.endAt,
    });
  }
  for (const legacyKey of ["year", "date", "stats"] as const) {
    if (legacyKey in event) {
      context.addIssue({
        code: "custom",
        path: [legacyKey],
        message: `Legacy event field "${legacyKey}" is not allowed in a modern event`,
        input: event[legacyKey],
      });
    }
  }
};
const modernEventFieldsSchema = z.object({
  startAt: isoDateTimeWithOffset,
  endAt: isoDateTimeWithOffset.optional(),
  // When no timezone is supplied, no location-specific timezone is invented.
  timezone: ianaTimeZone,
  location: z.string().min(1),
  format: eventFormat,
  desc: z.string().min(1),
  sourceUrl: httpUrl,
  registrationUrl: httpUrl.optional(),
  images: z.array(mediaUrl),
  completionMode: z.literal("manual").optional(),
  imageProvenance: z.literal("ai-generated-representative-artwork").optional(),
}).partial().passthrough();
export const modernEventDataSchema = modernEventFieldsSchema.superRefine((event, context) => {
  validateModernEventFields(event, context);
});
// Drafts and published items may omit metadata. Supplied facts retain the same
// type, date and chronology checks in both states.
export const modernEventDraftDataSchema = modernEventFieldsSchema
  .partial()
  .superRefine((event, context) => {
    validateModernEventFields(event, context);
  });
// Existing published event records remain readable while all newly generated
// events use the modern contract above.
export const legacyEventDataSchema = z.object({
  year: z.string().min(1), date: z.string().min(1), location: z.string().min(1),
  desc: z.string().min(1),
  stats: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) }).passthrough()).min(1),
  images: z.array(mediaUrl).min(1),
}).passthrough();

export const editorialDataByCollectionSchema = {
  newsletters: z.object({
    category: z.string().min(1), excerpt: z.string().min(1), url: httpUrl,
    image: mediaUrl, author: authorSchema,
  }).partial().passthrough(),
  masterclasses: z.object({
    detailTitle: z.string().min(1).optional(), category: z.string().min(1),
    excerpt: z.string().min(1), image: mediaUrl, author: authorSchema,
    framing: z.string().min(1), implications: z.string().min(1), url: httpUrl,
    authorName: z.string().min(1),
  }).partial().passthrough(),
  "future-work": z.object({
    name: z.string().min(1), desc: z.string().min(1), img: mediaUrl,
    sections: z.array(z.object({
      title: z.string().min(1), text: z.string().min(1), status: z.string().min(1),
    }).partial().passthrough()),
  }).partial().passthrough(),
  events: z.union([modernEventDataSchema, legacyEventDataSchema]),
  talks: z.object({
    topic: z.string().min(1),
    id: z.string().regex(/^[A-Za-z0-9_-]{11}$/, "Must be an 11-character YouTube video ID"),
    thumbnail: mediaUrl.optional(),
  }).partial().passthrough(),
  contributors: z.object({
    name: z.string().min(1), role: z.string().min(1), image: mediaUrl.optional(),
    coverImage: mediaUrl.optional(),
    group: z.enum(["Core Team", "Contributors"]),
    linkedinUrl: httpUrl.optional(),
    isNamedProspect: z.boolean().optional(), isPlaceholder: z.boolean().optional(),
    contributions: z.array(z.object({
      title: z.string().min(1), url: httpUrl.optional(), description: z.string().min(1).optional(),
    }).passthrough()).optional(),
    articles: z.array(z.object({
      title: z.string().min(1), excerpt: z.string().min(1).optional(), url: httpUrl.optional(),
      category: z.string().min(1).optional(),
    }).passthrough()).optional(),
  }).partial().passthrough(),
  communities: z.object({
    name: z.string().min(1), desc: z.string().min(1), url: httpUrl,
    image: mediaUrl.optional(),
  }).partial().passthrough(),
} as const;

// A title/slug identifies every item. Missing metadata must not invent facts or
// prevent publication; supplied values still pass the same safety/type checks.
const withoutEmptyMetadata = (value: unknown): unknown => {
  if (value === null || (typeof value === "string" && !value.trim())) return undefined;
  if (Array.isArray(value)) return value.map(withoutEmptyMetadata).filter(entry => entry !== undefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, withoutEmptyMetadata(child)]).filter(([, child]) => child !== undefined));
  }
  return value;
};

export const validateEditorialData = (
  collection: z.infer<typeof editorialCollectionSchema>,
  data: unknown,
) => editorialDataByCollectionSchema[collection].safeParse(withoutEmptyMetadata(data));

export const validateEditorialWriteData = (
  collection: z.infer<typeof editorialCollectionSchema>,
  data: unknown,
  status: z.infer<typeof editorialStatusSchema> = "published",
) => collection === "events"
  ? (status === "draft" ? modernEventDraftDataSchema : modernEventDataSchema).safeParse(withoutEmptyMetadata(data))
  : validateEditorialData(collection, data);

const slugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case");

export const createEditorialItemSchema = z
  .object({
    collection: editorialCollectionSchema,
    slug: slugSchema,
    title: z.string().trim().min(1).max(500),
    status: editorialStatusSchema.default("draft"),
    sortOrder: z.number().int().default(0),
    data: editorialDataSchema.default({}),
  })
  .strict();

export const patchEditorialItemSchema = createEditorialItemSchema
  .partial()
  .extend({ expectedVersion: z.number().int().positive() })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== "expectedVersion"),
    "At least one field must be updated",
  );

export const reorderEditorialItemsSchema = z
  .object({
    collection: editorialCollectionSchema,
    items: z.array(z.object({
      id: z.string().uuid(),
      expectedVersion: z.number().int().positive(),
    })).min(1),
  })
  .strict()
  .refine(
    ({ items }) => new Set(items.map(({ id }) => id)).size === items.length,
    { message: "items must not contain duplicate IDs", path: ["items"] },
  );

export type EditorialItem = typeof editorialItemsTable.$inferSelect;
export type NewEditorialItem = z.infer<typeof createEditorialItemSchema>;