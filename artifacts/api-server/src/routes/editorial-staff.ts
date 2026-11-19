import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { randomUUID } from "node:crypto";
import {
  addEditorialStaffSchema,
  changeEditorialStaffRoleSchema,
  db,
  editorialStaffTable,
  type EditorialStaffMember,
} from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { logger } from "../lib/logger";
import { editorialInvitationMetadataKey } from "../lib/editorialInvitationClaim";
import { requireEditorialAdmin } from "../middlewares/requireEditorialStaff";

const router: IRouter = Router();
const uuidSchema = z.string().uuid();
const ownerEmail = process.env.EDITORIAL_OWNER_EMAIL?.trim().toLowerCase() ?? "";
const invitationLifetimeMs = 30 * 24 * 60 * 60 * 1_000;

const memberFieldsForResponse = {
  id: editorialStaffTable.id,
  email: editorialStaffTable.email,
  role: editorialStaffTable.role,
  clerkUserId: editorialStaffTable.clerkUserId,
  clerkInvitationId: editorialStaffTable.clerkInvitationId,
  clerkInvitationExpiresAt: editorialStaffTable.clerkInvitationExpiresAt,
  invitationClaimToken: editorialStaffTable.invitationClaimToken,
  createdAt: editorialStaffTable.createdAt,
  updatedAt: editorialStaffTable.updatedAt,
};

type MemberForResponse = Pick<
  EditorialStaffMember,
  | "id"
  | "email"
  | "role"
  | "clerkUserId"
  | "clerkInvitationId"
  | "clerkInvitationExpiresAt"
  | "invitationClaimToken"
  | "createdAt"
  | "updatedAt"
>;

const memberResponse = (member: MemberForResponse) => {
  const {
    clerkUserId,
    clerkInvitationId: _invitationId,
    clerkInvitationExpiresAt,
    invitationClaimToken: _claimToken,
    ...publicMember
  } = member;
  return {
    ...publicMember,
    status: clerkUserId
      ? "active"
      : clerkInvitationExpiresAt &&
          clerkInvitationExpiresAt.getTime() > Date.now()
        ? "invited"
        : "expired",
  };
};

router.get("/editorial/staff", requireEditorialAdmin, async (_request, response) => {
  const members = await db
    .select(memberFieldsForResponse)
    .from(editorialStaffTable)
    .orderBy(asc(editorialStaffTable.createdAt));
  return response.json({ data: members.map(memberResponse) });
});

router.post("/editorial/staff", requireEditorialAdmin, async (request, response) => {
  const input = addEditorialStaffSchema.safeParse(request.body);
  if (!input.success) {
    return response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter a valid email and staff role",
        details: input.error.issues,
      },
    });
  }
  if (input.data.email === ownerEmail) {
    return response.status(409).json({
      error: { code: "OWNER_EXISTS", message: "The owner account already has access" },
    });
  }
  const [existing] = await db
    .select({ id: editorialStaffTable.id })
    .from(editorialStaffTable)
    .where(eq(editorialStaffTable.email, input.data.email))
    .limit(1);
  if (existing) {
    return response.status(409).json({
      error: {
        code: "STAFF_ALREADY_EXISTS",
        message: "That email already has editorial access",
      },
    });
  }

  let invitationId: string | null = null;
  try {
    const invitationClaimToken = randomUUID();
    const invitation = await clerkClient.invitations.createInvitation({
      emailAddress: input.data.email,
      expiresInDays: 30,
      ignoreExisting: true,
      notify: true,
      redirectUrl: "/konnected-insights/sign-up",
      publicMetadata: {
        [editorialInvitationMetadataKey]: invitationClaimToken,
      },
    });
    invitationId = invitation.id;
    const [member] = await db
      .insert(editorialStaffTable)
      .values({
        ...input.data,
        clerkInvitationId: invitation.id,
        clerkInvitationExpiresAt: new Date(
          invitation.createdAt + invitationLifetimeMs,
        ),
        invitationClaimToken,
        createdByUserId: response.locals.staffUserId,
      })
      .returning(memberFieldsForResponse);
    return response.status(201).json({ data: memberResponse(member) });
  } catch (error) {
    if (invitationId) {
      try {
        await clerkClient.invitations.revokeInvitation(invitationId);
      } catch (revokeError) {
        logger.error(
          { err: revokeError, invitationId },
          "Failed to roll back Clerk invitation",
        );
      }
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return response.status(409).json({
        error: {
          code: "STAFF_ALREADY_EXISTS",
          message: "That email already has editorial access",
        },
      });
    }
    logger.error(
      { err: error, email: input.data.email },
      "Failed to create editorial staff invitation",
    );
    return response.status(502).json({
      error: {
        code: "INVITATION_FAILED",
        message: "Could not send the invitation email. Please try again.",
      },
    });
  }
});

router.patch(
  "/editorial/staff/:id",
  requireEditorialAdmin,
  async (request, response) => {
    const id = uuidSchema.safeParse(request.params.id);
    const input = changeEditorialStaffRoleSchema.safeParse(request.body);
    if (!id.success || !input.success) {
      return response.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid staff update" },
      });
    }
    const outcome = await db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`editorial-staff:${id.data}`}))`,
      );
      const [existing] = await transaction
        .select()
        .from(editorialStaffTable)
        .where(eq(editorialStaffTable.id, id.data))
        .limit(1);
      if (!existing) return { kind: "not-found" } as const;
      if (existing.role === "owner" || existing.email === ownerEmail) {
        return { kind: "owner" } as const;
      }
      const [member] = await transaction
        .update(editorialStaffTable)
        .set({ role: input.data.role, updatedAt: new Date() })
        .where(eq(editorialStaffTable.id, id.data))
        .returning(memberFieldsForResponse);
      return { kind: "updated", member } as const;
    });
    if (outcome.kind === "not-found") {
      return response.status(404).json({
        error: { code: "STAFF_NOT_FOUND", message: "Staff member not found" },
      });
    }
    if (outcome.kind === "owner") {
      return response.status(403).json({
        error: { code: "OWNER_IMMUTABLE", message: "The owner role cannot be changed" },
      });
    }
    const { member } = outcome;
    return response.json({ data: memberResponse(member) });
  },
);

router.delete(
  "/editorial/staff/:id",
  requireEditorialAdmin,
  async (request, response) => {
    const id = uuidSchema.safeParse(request.params.id);
    if (!id.success) {
      return response.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid staff member" },
      });
    }
    const outcome = await db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`editorial-staff:${id.data}`}))`,
      );
      const [existing] = await transaction
        .select()
        .from(editorialStaffTable)
        .where(eq(editorialStaffTable.id, id.data))
        .limit(1);
      if (!existing) return "not-found" as const;
      if (existing.role === "owner" || existing.email === ownerEmail) {
        return "owner" as const;
      }
      await transaction
        .delete(editorialStaffTable)
        .where(eq(editorialStaffTable.id, id.data));
      return {
        kind: "deleted",
        invitationId: existing.clerkInvitationId,
      } as const;
    });
    if (outcome === "not-found") {
      return response.status(404).json({
        error: { code: "STAFF_NOT_FOUND", message: "Staff member not found" },
      });
    }
    if (outcome === "owner") {
      return response.status(403).json({
        error: { code: "OWNER_IMMUTABLE", message: "The owner cannot be removed" },
      });
    }
    if (outcome.invitationId) {
      try {
        await clerkClient.invitations.revokeInvitation(outcome.invitationId);
      } catch (error) {
        logger.warn(
          { err: error, invitationId: outcome.invitationId },
          "Clerk invitation was already accepted, expired, or revoked",
        );
      }
    }
    return response.status(204).send();
  },
);

export default router;