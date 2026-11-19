import {
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export type EditorialImagePurpose = "public" | "evidence" | "generated";

/**
 * PostgreSQL-backed editorial image storage. This is intentionally separate
 * from editorial item JSON so access policy and provenance remain enforceable
 * at the server boundary.
 */
export const editorialImageAssetsTable = pgTable(
  "editorial_image_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purpose: varchar("purpose", { length: 16 }).$type<EditorialImagePurpose>().notNull(),
    contentType: varchar("content_type", { length: 32 }).notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    size: integer("size").notNull(),
    bytes: bytea("bytes").notNull(),
    uploadedByUserId: text("uploaded_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("editorial_image_assets_purpose_created_at_idx").on(
      table.purpose,
      table.createdAt,
    ),
  ],
);

export type EditorialImageAsset = typeof editorialImageAssetsTable.$inferSelect;