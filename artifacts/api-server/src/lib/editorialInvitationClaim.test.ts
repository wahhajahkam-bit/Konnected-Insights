import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateEditorialInvitationClaim,
  type EditorialInvitationClaimEvidence,
} from "./editorialInvitationClaim";

const now = new Date("2026-08-29T12:00:00.000Z");
const token = "72d917ac-f94c-4d28-acf5-7330bd4ff65e";
const email = "editor@example.com";

const acceptedEvidence = (
  overrides: Partial<EditorialInvitationClaimEvidence> = {},
): EditorialInvitationClaimEvidence => ({
  now,
  expiresAt: new Date("2026-09-28T12:00:00.000Z"),
  expectedEmail: email,
  verifiedEmails: [email],
  expectedToken: token,
  invitationEmail: email,
  invitationStatus: "accepted",
  invitationToken: token,
  userToken: token,
  ...overrides,
});

test("accepts only the specific accepted Clerk invitation", () => {
  assert.deepEqual(evaluateEditorialInvitationClaim(acceptedEvidence()), {
    allowed: true,
  });
});

test("rejects an unaccepted pending invitation", () => {
  assert.deepEqual(
    evaluateEditorialInvitationClaim(
      acceptedEvidence({ invitationStatus: "pending" }),
    ),
    { allowed: false, reason: "invitation-not-accepted" },
  );
});

test("rejects revoked and provider-expired invitations", () => {
  for (const invitationStatus of ["revoked", "expired"] as const) {
    assert.deepEqual(
      evaluateEditorialInvitationClaim(
        acceptedEvidence({ invitationStatus }),
      ),
      { allowed: false, reason: "invitation-not-accepted" },
    );
  }
});

test("rejects a locally expired database grant even if Clerk says accepted", () => {
  assert.deepEqual(
    evaluateEditorialInvitationClaim(
      acceptedEvidence({
        expiresAt: new Date("2026-08-29T11:59:59.999Z"),
      }),
    ),
    { allowed: false, reason: "expired" },
  );
});

test("rejects a pre-existing matching-email account that did not accept the ticket", () => {
  assert.deepEqual(
    evaluateEditorialInvitationClaim(acceptedEvidence({ userToken: undefined })),
    { allowed: false, reason: "user-token-mismatch" },
  );
});

test("rejects metadata from a different invitation", () => {
  assert.deepEqual(
    evaluateEditorialInvitationClaim(
      acceptedEvidence({
        invitationToken: "9295f3bf-7f73-49ab-9379-43159c8be09b",
      }),
    ),
    { allowed: false, reason: "invitation-token-mismatch" },
  );
});

test("rejects an accepted invitation for a different email", () => {
  assert.deepEqual(
    evaluateEditorialInvitationClaim(
      acceptedEvidence({ invitationEmail: "other@example.com" }),
    ),
    { allowed: false, reason: "email-mismatch" },
  );
});