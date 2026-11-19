import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const newsletterRunStatusEnum = pgEnum("newsletter_run_status", [
  "running",
  "succeeded",
  "partial",
  "failed",
]);

export const newsletterSourcesTable = pgTable(
  "newsletter_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    senderEmail: text("sender_email").notNull(),
    subjectKeywords: text("subject_keywords").array().default([]).notNull(),
    instructions: text("instructions").default("").notNull(),
    referenceUrls: text("reference_urls").array().default([]).notNull(),
    contributorId: uuid("contributor_id").notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    version: integer("version").default(1).notNull(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("newsletter_sources_due_idx").on(table.enabled, table.nextRunAt)],
);

export const newsletterSourceRunsTable = pgTable(
  "newsletter_source_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => newsletterSourcesTable.id, { onDelete: "cascade" }),
    sourceVersion: integer("source_version").notNull(),
    status: newsletterRunStatusEnum("status").default("running").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    fetched: integer("fetched").default(0).notNull(),
    created: integer("created").default(0).notNull(),
    skipped: integer("skipped").default(0).notNull(),
    failed: integer("failed").default(0).notNull(),
    errors: jsonb("errors").$type<string[]>().default([]).notNull(),
    drafts: jsonb("drafts").$type<Array<{ id: string; title: string }>>().default([]).notNull(),
    message: text("message").default("").notNull(),
    hasMore: boolean("has_more").default(false).notNull(),
  },
  (table) => [
    index("newsletter_source_runs_source_started_idx").on(table.sourceId, table.startedAt),
  ],
);

export type NewsletterSourceRow = typeof newsletterSourcesTable.$inferSelect;
export type NewsletterSourceRunRow = typeof newsletterSourceRunsTable.$inferSelect;