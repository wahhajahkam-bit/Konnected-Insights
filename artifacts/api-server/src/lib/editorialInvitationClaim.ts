export const editorialInvitationMetadataKey =
  "editorialInvitationClaimToken";

export type EditorialInvitationStatus =
  | "pending"
  | "accepted"
  | "revoked"
  | "expired"
  | "missing";

export type EditorialInvitationClaimEvidence = {
  now: Date;
  expiresAt: Date | null;
  expectedEmail: string;
  verifiedEmails: string[];
  expectedToken: string | null;
  invitationEmail: string | null;
  invitationStatus: EditorialInvitationStatus;
  invitationToken: unknown;
  userToken: unknown;
};

export type EditorialInvitationClaimDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "missing-claim-data"
        | "expired"
        | "email-mismatch"
        | "invitation-not-accepted"
        | "invitation-token-mismatch"
        | "user-token-mismatch";
    };

export const evaluateEditorialInvitationClaim = (
  evidence: EditorialInvitationClaimEvidence,
): EditorialInvitationClaimDecision => {
  if (!evidence.expiresAt || !evidence.expectedToken) {
    return { allowed: false, reason: "missing-claim-data" };
  }
  if (evidence.expiresAt.getTime() <= evidence.now.getTime()) {
    return { allowed: false, reason: "expired" };
  }
  if (
    !evidence.invitationEmail ||
    evidence.invitationEmail.trim().toLowerCase() !== evidence.expectedEmail ||
    !evidence.verifiedEmails.includes(evidence.expectedEmail)
  ) {
    return { allowed: false, reason: "email-mismatch" };
  }
  if (evidence.invitationStatus !== "accepted") {
    return { allowed: false, reason: "invitation-not-accepted" };
  }
  if (evidence.invitationToken !== evidence.expectedToken) {
    return { allowed: false, reason: "invitation-token-mismatch" };
  }
  if (evidence.userToken !== evidence.expectedToken) {
    return { allowed: false, reason: "user-token-mismatch" };
  }
  return { allowed: true };
};