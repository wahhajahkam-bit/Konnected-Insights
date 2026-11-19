import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import {
  db,
  editorialStaffTable,
  type EditorialStaffRole,
} from "@workspace/db";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  editorialInvitationMetadataKey,
  evaluateEditorialInvitationClaim,
} from "../lib/editorialInvitationClaim";

export type EditorialAccess = {
  allowed: boolean;
  role: EditorialStaffRole | null;
  email: string | null;
  canManageStaff: boolean;
};

const deniedAccess: EditorialAccess = {
  allowed: false,
  role: null,
  email: null,
  canManageStaff: false,
};

const ownerEmail = process.env.EDITORIAL_OWNER_EMAIL?.trim().toLowerCase() ?? "";

export const getAuthenticatedUserId = (request: Request) => {
  const auth = getAuth(request);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  return typeof userId === "string" ? userId : null;
};

export const getEditorialStaffAccess = async (
  userId: string,
): Promise<EditorialAccess> => {
  try {
    const user = await clerkClient.users.getUser(userId);
    const verifiedEmails = user.emailAddresses
      .filter((address) => address.verification?.status === "verified")
      .map((address) => address.emailAddress.trim().toLowerCase());
    let member;

    if (ownerEmail && verifiedEmails.includes(ownerEmail)) {
      [member] = await db
        .insert(editorialStaffTable)
        .values({
          email: ownerEmail,
          role: "owner",
          clerkUserId: userId,
          createdByUserId: userId,
        })
        .onConflictDoUpdate({
          target: editorialStaffTable.email,
          set: {
            role: "owner",
            clerkUserId: userId,
            updatedAt: new Date(),
          },
        })
        .returning();
    } else if (verifiedEmails.length) {
      const invitations = await db
        .select()
        .from(editorialStaffTable)
        .where(inArray(editorialStaffTable.email, verifiedEmails));
      const linkedInvitation = invitations.find(
        (invitation) => invitation.clerkUserId === userId,
      );
      if (linkedInvitation) {
        member = linkedInvitation;
      } else {
        const unclaimedInvitation = invitations.find(
          (invitation) => !invitation.clerkUserId,
        );
        if (
          unclaimedInvitation?.clerkInvitationId &&
          unclaimedInvitation.clerkInvitationExpiresAt &&
          unclaimedInvitation.invitationClaimToken
        ) {
          const clerkInvitations =
            await clerkClient.invitations.getInvitationList({
              query: unclaimedInvitation.clerkInvitationId,
            });
          const clerkInvitation = clerkInvitations.data.find(
            (invitation) =>
              invitation.id === unclaimedInvitation.clerkInvitationId,
          );
          const decision = evaluateEditorialInvitationClaim({
            now: new Date(),
            expiresAt: unclaimedInvitation.clerkInvitationExpiresAt,
            expectedEmail: unclaimedInvitation.email,
            verifiedEmails,
            expectedToken: unclaimedInvitation.invitationClaimToken,
            invitationEmail: clerkInvitation?.emailAddress ?? null,
            invitationStatus: clerkInvitation?.status ?? "missing",
            invitationToken:
              clerkInvitation?.publicMetadata?.[
                editorialInvitationMetadataKey
              ],
            userToken:
              user.publicMetadata?.[editorialInvitationMetadataKey],
          });
          if (!decision.allowed) {
            return deniedAccess;
          }
          [member] = await db
              .update(editorialStaffTable)
              .set({
                clerkUserId: userId,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(editorialStaffTable.id, unclaimedInvitation.id),
                  isNull(editorialStaffTable.clerkUserId),
                  gt(
                    editorialStaffTable.clerkInvitationExpiresAt,
                    new Date(),
                  ),
                ),
              )
              .returning();
        }
      }
    }

    const access: EditorialAccess = member
      ? {
          allowed: true,
          role: member.role,
          email: member.email,
          canManageStaff: member.role === "owner" || member.role === "admin",
        }
      : deniedAccess;
    return access;
  } catch (error) {
    logger.error({ err: error, userId }, "Failed to verify editorial staff access");
    return deniedAccess;
  }
};

export const requireEditorialStaff = async (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return response.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Staff sign-in is required" },
    });
  }
  const access = await getEditorialStaffAccess(userId);
  if (!access.allowed) {
    return response.status(403).json({
      error: { code: "STAFF_ACCESS_DENIED", message: "Editorial staff access is required" },
    });
  }
  response.locals.staffUserId = userId;
  response.locals.editorialAccess = access;
  return next();
};

export const requireEditorialAdmin = async (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return response.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Staff sign-in is required" },
    });
  }
  const access = await getEditorialStaffAccess(userId);
  if (!access.canManageStaff) {
    return response.status(403).json({
      error: {
        code: "ADMIN_ACCESS_DENIED",
        message: "Administrator access is required",
      },
    });
  }
  response.locals.staffUserId = userId;
  response.locals.editorialAccess = access;
  return next();
};