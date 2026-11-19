import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const editorialStaffRoles = ["owner", "admin", "editor"] as const;
export const editorialStaffRoleEnum = pgEnum(
  "editorial_staff_role",
  editorialStaffRoles,
);

export const editorialStaffTable = pgTable(
  "editorial_staff",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    role: editorialStaffRoleEnum("role").default("editor").notNull(),
    clerkUserId: text("clerk_user_id"),
    clerkInvitationId: text("clerk_invitation_id"),
    clerkInvitationExpiresAt: timestamp("clerk_invitation_expires_at", {
      withTimezone: true,
    }),
    invitationClaimToken: uuid("invitation_claim_token"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("editorial_staff_email_unique").on(table.email),
    uniqueIndex("editorial_staff_clerk_user_id_unique").on(table.clerkUserId),
    uniqueIndex("editorial_staff_clerk_invitation_id_unique").on(
      table.clerkInvitationId,
    ),
    uniqueIndex("editorial_staff_invitation_claim_token_unique").on(
      table.invitationClaimToken,
    ),
  ],
);

export const editorialStaffRoleSchema = z.enum(editorialStaffRoles);
export const addEditorialStaffSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),
    role: z.enum(["admin", "editor"]).default("editor"),
  })
  .strict();
export const changeEditorialStaffRoleSchema = z
  .object({ role: z.enum(["admin", "editor"]) })
  .strict();

export type EditorialStaffRole = (typeof editorialStaffRoles)[number];
export type EditorialStaffMember = typeof editorialStaffTable.$inferSelect;