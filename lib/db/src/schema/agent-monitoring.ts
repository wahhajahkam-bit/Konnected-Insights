import { pgTable, text, uuid, timestamp, doublePrecision, numeric, bigint, boolean, jsonb, uniqueIndex, index, type AnyPgColumn } from "drizzle-orm/pg-core";
export const agentRunsTable = pgTable("agent_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: text("agent_id").notNull(), category: text("category").notNull(), label: text("label").notNull(),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }), durationMs: doublePrecision("duration_ms"),
  parentRunId: uuid("parent_run_id").references((): AnyPgColumn => agentRunsTable.id),
  sourceId: text("source_id"), provenance: text("provenance").notNull().default("automatic"),
  outcome: text("outcome"), outputPath: text("output_path"), costAmount: numeric("cost_amount"), currency: text("currency"),
  reference: text("reference"), notes: text("notes"), enteredBy: text("entered_by"), updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [uniqueIndex("agent_runs_agent_id_source_id_key").on(t.agentId, t.sourceId), index("agent_runs_parent_idx").on(t.parentRunId)]);
export const agentOperationsTable = pgTable("agent_operations", {
  id: uuid("id").defaultRandom().primaryKey(), runId: uuid("run_id").notNull().references(() => agentRunsTable.id),
  key: text("key").notNull(), model: text("model"),
  inputTokens: bigint("input_tokens", { mode: "number" }), outputTokens: bigint("output_tokens", { mode: "number" }),
  cachedTokens: bigint("cached_tokens", { mode: "number" }), toolCalls: bigint("tool_calls", { mode: "number" }),
  inputTextTokens: bigint("input_text_tokens", { mode: "number" }), inputImageTokens: bigint("input_image_tokens", { mode: "number" }),
  outputTextTokens: bigint("output_text_tokens", { mode: "number" }), outputImageTokens: bigint("output_image_tokens", { mode: "number" }),
  costAmount: numeric("cost_amount"), currency: text("currency"), pricingVersion: text("pricing_version"),
  startedAt: timestamp("started_at", { withTimezone: true }), finishedAt: timestamp("finished_at", { withTimezone: true }),
  providerCallMs: doublePrecision("provider_call_ms"), pricingSource: text("pricing_source"), pricingEffectiveDate: text("pricing_effective_date"),
  partial: boolean("partial").notNull().default(false), breakdown: jsonb("breakdown"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("agent_operations_run_id_key_key").on(t.runId, t.key)]);
export const agentManualAuditTable = pgTable("agent_manual_audit", {
  id: uuid("id").defaultRandom().primaryKey(), runId: uuid("run_id").notNull().references(() => agentRunsTable.id),
  action: text("action").notNull(), actor: text("actor").notNull(), at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});