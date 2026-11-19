import { pgTable, text, uuid, integer, boolean, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const futureWorkFunctions = pgTable("future_work_functions", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(), name: text("name").notNull(),
  description: text("description").notNull().default(""),
  presentation: jsonb("presentation").notNull().default({}),
  researchSources: jsonb("research_sources"),
  sortOrder: integer("sort_order").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  revision: integer("revision").notNull().default(1),
});
const versionColumns = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  functionId: uuid("function_id").notNull().references(() => futureWorkFunctions.id),
  horizon: integer("horizon").notNull().default(2030),
  lens: text("lens").notNull().default("technology"),
  slot: text("slot").notNull(),
  status: text("status").notNull().default("pending_review"),
  data: jsonb("data").notNull().default({}),
  revision: integer("revision").notNull().default(1),
  previousVersionId: uuid("previous_version_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  stale: boolean("stale").notNull().default(false),
});
export const futureOfWorkContent = pgTable("future_of_work_content", versionColumns(), t => [
  uniqueIndex("future_work_one_published_content").on(t.slot).where(sql`${t.status} = 'published'`),
  uniqueIndex("future_work_one_published_combination").on(t.functionId,t.horizon,t.lens).where(sql`${t.status} = 'published'`),
]);
export const leadingPrograms = pgTable("leading_programs", versionColumns(), t => [
  uniqueIndex("future_work_one_published_program").on(t.slot).where(sql`${t.status} = 'published'`),
]);
export const futureWorkNews = pgTable("future_work_news", versionColumns(), t => [
  uniqueIndex("future_work_one_published_news").on(t.slot).where(sql`${t.status} = 'published'`),
]);
export const futureWorkSchedules = pgTable("future_work_schedules", {
  id: text("id").primaryKey(), enabled: boolean("enabled").notNull().default(false),
  revision: integer("revision").notNull().default(1),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
  sourceWindowMonths: integer("source_window_months").notNull(),
  staleAfterDays: integer("stale_after_days").notNull(),
  verificationOnlyOptIn: boolean("verification_only_opt_in").notNull().default(false),
  cursor: integer("cursor").notNull().default(0),
});
export const researchLog = pgTable("research_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  scheduleId: text("schedule_id").notNull().references(() => futureWorkSchedules.id),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  leaseUntil: timestamp("lease_until", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(1),
  processed: integer("processed").notNull().default(0),
  sourcesFound: integer("sources_found").notNull().default(0),
  sourcesAccepted: integer("sources_accepted").notNull().default(0),
  sourcesRejected: integer("sources_rejected").notNull().default(0),
  errors: jsonb("errors").notNull().default([]),
  usage: jsonb("usage").notNull().default([]),
  results: jsonb("results").notNull().default([]),
  plan: jsonb("plan").notNull().default([]),
  requestedBy: text("requested_by"),
}, t => [uniqueIndex("future_work_single_worker").on(sql`(true)`).where(sql`${t.status} = 'running'`)]);
export const futureWorkEvidence = pgTable("future_work_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => researchLog.id),
  publisher: text("publisher").notNull(), url: text("url").notNull(),
  accepted: boolean("accepted").notNull().default(false),
  evidence: jsonb("evidence").notNull(),
}, t => [uniqueIndex("future_work_evidence_run_url").on(t.runId, t.url)]);
export const futureWorkDecisions = pgTable("future_work_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(), versionId: uuid("version_id").notNull(),
  action: text("action").notNull(), actor: text("actor").notNull(),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const futureWorkResearchQueue = pgTable("future_work_research_queue", {
  id: uuid("id").primaryKey().defaultRandom(), kind: text("kind").notNull(),
  versionId: uuid("version_id").notNull().unique(),
  functionId: uuid("function_id").notNull().references(()=>futureWorkFunctions.id,{onDelete:"cascade"}),
  horizon: integer("horizon").notNull(), lens: text("lens").notNull(),
  status: text("status").notNull().default("queued"),
  runId: uuid("run_id").references(()=>researchLog.id,{onDelete:"set null"}),
  candidateVersionId: uuid("candidate_version_id"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at",{withTimezone:true}).notNull().defaultNow(),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
});