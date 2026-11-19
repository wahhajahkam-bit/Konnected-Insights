import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Durable, per-user audit rows used for the editorial AI rolling-window limit. */
export const aiGenerationUsageTable = pgTable(
  "ai_generation_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("ai_generation_usage_user_used_at_idx").on(table.userId, table.usedAt)],
);