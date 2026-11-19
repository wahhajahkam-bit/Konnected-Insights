// This module is reachable ONLY through the monitoring test runner's esbuild alias.
// Production code continues to import the real @clerk/express SDK.
export const getAuth = (request: { headers: Record<string, unknown> }) => ({ userId: request.headers["x-test-user"] ?? null });
export const clerkClient = {
  users: { getUser: async (id: string) => ({
    emailAddresses: [{ emailAddress: `${id}@monitoring.test`, verification: { status: "verified" } }],
  }) },
  invitations: { getInvitationList: async () => ({ data: [] }) },
};