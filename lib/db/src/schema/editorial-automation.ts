import { boolean, integer, jsonb, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const editorialAutomationRulesTable = pgTable("editorial_automation_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  collection: text("collection").notNull(),
  senders: jsonb("senders").$type<string[]>().notNull(),
  search: text("search").notNull().default(""),
  guidance: text("guidance").notNull().default(""),
  enabled: boolean("enabled").notNull().default(false),
  publishMode: text("publish_mode").notNull().default("draft"),
  scheduleUtc: text("schedule_utc").notNull().default("02:00"),
  lookbackDays: integer("lookback_days").notNull().default(7),
  maxItems: integer("max_items").notNull().default(10),
  mailboxEmail: text("mailbox_email").notNull(),
  createdByUserId: text("created_by_user_id").notNull(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastError: text("last_error"),
  leaseToken: uuid("lease_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const editorialAutomationRunsTable = pgTable("editorial_automation_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  ruleId: uuid("rule_id").notNull().references(() => editorialAutomationRulesTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  matched: integer("matched").notNull().default(0),
  attempted: integer("attempted").notNull().default(0),
  created: integer("created").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  error: text("error"),
});

// Gmail identifiers and source metadata never enter the public editorial data.
export const editorialAutomationMessagesTable = pgTable("editorial_automation_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  ruleId: uuid("rule_id").notNull().references(() => editorialAutomationRulesTable.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull(),
  status: text("status").notNull().default("failed"),
  editorialItemId: uuid("editorial_item_id"),
  error: text("error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("editorial_automation_rule_message_unique").on(table.ruleId, table.messageId)]);

export const insertEditorialAutomationRuleSchema = createInsertSchema(editorialAutomationRulesTable).omit({
  id: true, createdAt: true, updatedAt: true, leaseToken: true, leaseUntil: true,
});
export type EditorialAutomationRule = typeof editorialAutomationRulesTable.$inferSelect;
export type EditorialAutomationRun = typeof editorialAutomationRunsTable.$inferSelect;