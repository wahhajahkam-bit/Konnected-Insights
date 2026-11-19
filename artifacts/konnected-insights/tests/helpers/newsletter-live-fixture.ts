import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pool } from "../../../../lib/db/src/index";

const CLERK_API = "https://api.clerk.com/v1";
const RUN_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../.local/.newsletter-live-runs",
);

type RunManifest = {
  version: 1;
  runId: string;
  email: string;
  externalId: string;
  userId: string | null;
  staffId: string;
  slugs: string[];
  referenceUrls: string[];
  editorialItemIds: string[];
  usageIds: string[];
};

type ClerkEmail = {
  email_address?: unknown;
  verification?: { status?: unknown } | null;
};

type ClerkUser = {
  id?: unknown;
  external_id?: unknown;
  email_addresses?: unknown;
};

function assertLiveTestGuards(): {
  secretKey: string;
  developmentUrl: string;
} {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Newsletter live fixture is disabled in production");
  }
  if (
    process.env.NEWSLETTER_LIVE_AI !== "1" ||
    process.env.NEWSLETTER_DEV_DATABASE_CONFIRMED !== "1"
  ) {
    throw new Error("Newsletter live fixture safety confirmation is missing");
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey?.startsWith("sk_test_")) {
    throw new Error("Newsletter live fixture requires a Clerk test secret");
  }

  const domain = process.env.REPLIT_DEV_DOMAIN;
  const developmentUrl = process.env.NEWSLETTER_BASE_URL;
  if (
    !domain ||
    !developmentUrl ||
    developmentUrl !== `https://${domain}`
  ) {
    throw new Error("Newsletter live fixture development URL is not explicit");
  }

  return { secretKey, developmentUrl };
}

async function clerkRequest(
  secretKey: string,
  pathname: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    const signal = AbortSignal.timeout(20_000);
    response = await fetch(`${CLERK_API}${pathname}`, {
      ...init,
      signal,
      headers: {
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("Clerk test request failed");
  }

  if (response.status === 404) return { status: 404, body: null };

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Never include an upstream response body in a fixture error.
  }
  if (!response.ok) {
    throw new Error(`Clerk test request was rejected (${response.status})`);
  }
  return { status: response.status, body };
}

function parseExactClerkUserForCleanup(
  value: unknown,
  expected: Pick<RunManifest, "email" | "externalId">,
): { id: string; user: ClerkUser } {
  if (!value || typeof value !== "object") {
    throw new Error("Clerk test identity response was invalid");
  }
  const user = value as ClerkUser;
  if (
    typeof user.id !== "string" ||
    !/^user_[A-Za-z0-9]+$/.test(user.id) ||
    user.external_id !== expected.externalId
  ) {
    throw new Error("Clerk test identity did not match the run");
  }
  const emails = Array.isArray(user.email_addresses)
    ? (user.email_addresses as ClerkEmail[])
    : [];
  const matchingEmails = emails.filter(
    (entry) => entry?.email_address === expected.email,
  );
  if (emails.length !== 1 || matchingEmails.length !== 1) {
    throw new Error("Clerk test identity email did not match the run");
  }
  return { id: user.id, user };
}

function parseExactVerifiedClerkUser(
  value: unknown,
  expected: Pick<RunManifest, "email" | "externalId">,
): { id: string; user: ClerkUser } {
  const parsed = parseExactClerkUserForCleanup(value, expected);
  const email = (parsed.user.email_addresses as ClerkEmail[])[0];
  if (email?.verification?.status !== "verified") {
    throw new Error("Clerk test identity email was not verified");
  }
  return parsed;
}

async function findUserByExternalId(
  secretKey: string,
  manifest: RunManifest,
): Promise<ClerkUser | null> {
  const search = new URLSearchParams();
  search.append("external_id[]", manifest.externalId);
  const response = await clerkRequest(secretKey, `/users?${search.toString()}`);
  if (!Array.isArray(response.body)) {
    throw new Error("Clerk test identity lookup was invalid");
  }
  if (response.body.length === 0) return null;
  if (response.body.length !== 1) {
    throw new Error("Clerk test identity lookup was ambiguous");
  }
  return response.body[0] as ClerkUser;
}

async function getExactUser(
  secretKey: string,
  manifest: RunManifest,
): Promise<ClerkUser | null> {
  if (manifest.userId) {
    const response = await clerkRequest(
      secretKey,
      `/users/${encodeURIComponent(manifest.userId)}`,
    );
    if (response.status === 404) return null;
    return response.body as ClerkUser;
  }
  return findUserByExternalId(secretKey, manifest);
}

async function persistManifest(
  manifestPath: string,
  manifest: RunManifest,
): Promise<void> {
  const temporaryPath = `${manifestPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, manifestPath);
  await chmod(manifestPath, 0o600);
}

async function performCleanup(
  secretKey: string,
  manifestPath: string,
  manifest: RunManifest,
  saveManifest: () => Promise<void>,
): Promise<void> {
  const failures: string[] = [];
  const attempt = async (label: string, operation: () => Promise<void>) => {
    try {
      await operation();
    } catch {
      failures.push(label);
    }
  };

  await attempt("draft discovery", async () => {
    if (manifest.slugs.length === 0 && manifest.referenceUrls.length === 0) return;
    const discovered = await pool.query<{ id: string; slug: string }>(
      `SELECT id, slug FROM editorial_items
        WHERE collection = 'newsletters'
          AND (
            slug = ANY($1::text[])
            OR data->>'url' = ANY($2::text[])
            OR data->>'sourceUrl' = ANY($2::text[])
          )`,
      [manifest.slugs, manifest.referenceUrls],
    );
    const bySlug = new Map<string, string>();
    for (const row of discovered.rows) {
      if (bySlug.has(row.slug)) {
        throw new Error("Tracked newsletter draft lookup was ambiguous");
      }
      bySlug.set(row.slug, row.id);
    }
    manifest.editorialItemIds = [
      ...new Set([...manifest.editorialItemIds, ...bySlug.values()]),
    ];
    await saveManifest();
  });

  await attempt("draft deletion", async () => {
    if (manifest.editorialItemIds.length === 0) return;
    await pool.query(
      "DELETE FROM editorial_items WHERE id = ANY($1::uuid[])",
      [manifest.editorialItemIds],
    );
  });

  await attempt("usage discovery", async () => {
    if (!manifest.userId) return;
    const discovered = await pool.query<{ id: string }>(
      "SELECT id FROM ai_generation_usage WHERE user_id = $1",
      [manifest.userId],
    );
    manifest.usageIds = [
      ...new Set([...manifest.usageIds, ...discovered.rows.map(({ id }) => id)]),
    ];
    await saveManifest();
  });

  await attempt("usage deletion", async () => {
    if (manifest.usageIds.length === 0) return;
    await pool.query(
      "DELETE FROM ai_generation_usage WHERE id = ANY($1::uuid[])",
      [manifest.usageIds],
    );
  });

  await attempt("staff deletion", async () => {
    if (!manifest.userId) return;
    const result = await pool.query(
      `DELETE FROM editorial_staff
        WHERE id = $1 AND clerk_user_id = $2 AND email = $3`,
      [manifest.staffId, manifest.userId, manifest.email],
    );
    if (result.rowCount && result.rowCount > 1) {
      throw new Error("Temporary staff cleanup was not exact");
    }
  });

  await attempt("Clerk identity deletion", async () => {
    const user = await getExactUser(secretKey, manifest);
    if (!user) return;
    const parsed = parseExactClerkUserForCleanup(user, manifest);
    if (manifest.userId && parsed.id !== manifest.userId) {
      throw new Error("Clerk test identity ID did not match the run");
    }
    manifest.userId = parsed.id;
    await saveManifest();
    await clerkRequest(secretKey, `/users/${encodeURIComponent(parsed.id)}`, {
      method: "DELETE",
    });
  });

  await attempt("database verification", async () => {
    const draftCheck = manifest.editorialItemIds.length
      ? await pool.query(
          "SELECT id FROM editorial_items WHERE id = ANY($1::uuid[])",
          [manifest.editorialItemIds],
        )
      : { rowCount: 0 };
    const slugCheck = manifest.slugs.length
      ? await pool.query(
          `SELECT id FROM editorial_items
            WHERE collection = 'newsletters' AND slug = ANY($1::text[])`,
          [manifest.slugs],
        )
      : { rowCount: 0 };
    const referenceCheck = manifest.referenceUrls.length
      ? await pool.query(
          `SELECT id FROM editorial_items
            WHERE collection = 'newsletters'
              AND (
                data->>'url' = ANY($1::text[])
                OR data->>'sourceUrl' = ANY($1::text[])
              )`,
          [manifest.referenceUrls],
        )
      : { rowCount: 0 };
    const usageCheck = manifest.usageIds.length
      ? await pool.query(
          "SELECT id FROM ai_generation_usage WHERE id = ANY($1::uuid[])",
          [manifest.usageIds],
        )
      : { rowCount: 0 };
    const userUsageCheck = manifest.userId
      ? await pool.query(
          "SELECT id FROM ai_generation_usage WHERE user_id = $1",
          [manifest.userId],
        )
      : { rowCount: 0 };
    const staffCheck = await pool.query(
      "SELECT id FROM editorial_staff WHERE id = $1",
      [manifest.staffId],
    );
    if (
      draftCheck.rowCount !== 0 ||
      slugCheck.rowCount !== 0 ||
      referenceCheck.rowCount !== 0 ||
      usageCheck.rowCount !== 0 ||
      userUsageCheck.rowCount !== 0 ||
      staffCheck.rowCount !== 0
    ) {
      throw new Error("Newsletter fixture database cleanup was incomplete");
    }
  });

  await attempt("Clerk verification", async () => {
    const user = await getExactUser(secretKey, manifest);
    if (user) {
      parseExactClerkUserForCleanup(user, manifest);
      throw new Error("Newsletter fixture identity cleanup was incomplete");
    }
  });

  if (failures.length > 0) {
    throw new Error(
      `Newsletter fixture cleanup incomplete for run ${manifest.runId}: ${failures.join(", ")}`,
    );
  }

  try {
    // The fixture pool is shared across sequential live tests. Ending it here
    // makes the next fixture fail during its isolated staff setup.
    await rm(manifestPath);
  } catch {
    throw new Error(
      `Newsletter fixture cleanup finalization failed for run ${manifest.runId}`,
    );
  }
}

function validateManifest(value: unknown, runId: string): RunManifest {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const isUuidArray = (entry: unknown): entry is string[] =>
    Array.isArray(entry) &&
    entry.every((item) => typeof item === "string" && uuid.test(item));
  const isSlugArray = (entry: unknown): entry is string[] =>
    Array.isArray(entry) &&
    entry.every(
      (item) =>
        typeof item === "string" &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item) &&
        item.includes(runId),
    );
  const isReferenceUrlArray = (entry: unknown): entry is string[] =>
    Array.isArray(entry) &&
    entry.every((item) => {
      if (typeof item !== "string" || !item.includes(runId)) return false;
      try {
        const url = new URL(item);
        return (
          url.protocol === "https:" &&
          (url.hostname === "linkedin.com" ||
            url.hostname === "www.linkedin.com") &&
          url.pathname.startsWith("/pulse/")
        );
      } catch {
        return false;
      }
    });

  if (!value || typeof value !== "object") {
    throw new Error("Newsletter cleanup manifest is invalid");
  }
  const manifest = value as Partial<RunManifest>;
  if (
    manifest.version !== 1 ||
    manifest.runId !== runId ||
    manifest.email !== `newsletter.qa.${runId}@example.com` ||
    manifest.externalId !== `newsletter-live:${runId}` ||
    typeof manifest.staffId !== "string" ||
    !uuid.test(manifest.staffId) ||
    !(
      manifest.userId === null ||
      (typeof manifest.userId === "string" &&
        /^user_[A-Za-z0-9]+$/.test(manifest.userId))
    ) ||
    !isSlugArray(manifest.slugs) ||
    !isReferenceUrlArray(manifest.referenceUrls) ||
    !isUuidArray(manifest.editorialItemIds) ||
    !isUuidArray(manifest.usageIds)
  ) {
    throw new Error("Newsletter cleanup manifest is invalid");
  }
  return manifest as RunManifest;
}

export async function cleanupNewsletterRun(runId: string): Promise<void> {
  const { secretKey } = assertLiveTestGuards();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      runId,
    )
  ) {
    throw new Error("Newsletter cleanup run ID is invalid");
  }

  const manifestPath = path.join(RUN_DIRECTORY, `${runId}.json`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    throw new Error("Newsletter cleanup manifest could not be loaded");
  }
  const manifest = validateManifest(parsed, runId);
  const saveManifest = () => persistManifest(manifestPath, manifest);
  await performCleanup(secretKey, manifestPath, manifest, saveManifest);
}

export async function createNewsletterFixture() {
  const { secretKey } = assertLiveTestGuards();
  const runId = randomUUID();
  const email = `newsletter.qa.${runId}@example.com`;
  const staffId = randomUUID();
  const manifestPath = path.join(RUN_DIRECTORY, `${runId}.json`);
  const manifest: RunManifest = {
    version: 1,
    runId,
    email,
    externalId: `newsletter-live:${runId}`,
    userId: null,
    staffId,
    slugs: [],
    referenceUrls: [],
    editorialItemIds: [],
    usageIds: [],
  };

  await mkdir(RUN_DIRECTORY, { recursive: true, mode: 0o700 });
  await chmod(RUN_DIRECTORY, 0o700);
  await persistManifest(manifestPath, manifest);
  console.info(
    `Newsletter live fixture created run manifest: runId=${runId} manifest=${manifestPath}`,
  );

  let manifestWrite = Promise.resolve();
  let cleanupComplete = false;

  const saveManifest = async () => {
    manifestWrite = manifestWrite.then(() =>
      persistManifest(manifestPath, manifest),
    );
    await manifestWrite;
  };

  const cleanup = async (): Promise<void> => {
    if (cleanupComplete) return;
    assertLiveTestGuards();
    await manifestWrite.catch(() => undefined);
    await performCleanup(secretKey, manifestPath, manifest, saveManifest);
    cleanupComplete = true;
  };

  try {
    let createdUser: ClerkUser | null = null;
    try {
      const response = await clerkRequest(secretKey, "/users", {
        method: "POST",
        body: JSON.stringify({
          email_address: [email],
          first_name: "Newsletter",
          last_name: "QA",
          external_id: manifest.externalId,
          skip_password_requirement: true,
          skip_password_checks: true,
        }),
      });
      createdUser = response.body as ClerkUser;
    } catch {
      // A timed-out or otherwise ambiguous POST may still have created the user.
      createdUser = await findUserByExternalId(secretKey, manifest);
      if (!createdUser) {
        throw new Error("Clerk test identity could not be created");
      }
    }

    const parsedCreated = parseExactVerifiedClerkUser(createdUser, manifest);
    manifest.userId = parsedCreated.id;
    await saveManifest();

    const fetched = await getExactUser(secretKey, manifest);
    if (!fetched) throw new Error("Clerk test identity could not be verified");
    const verified = parseExactVerifiedClerkUser(fetched, manifest);
    if (verified.id !== manifest.userId) {
      throw new Error("Clerk test identity verification did not match");
    }

    const userId = verified.id;
    return {
      runId,
      email,
      userId,
      staffId,

      async approveEditor(): Promise<void> {
        if (cleanupComplete) {
          throw new Error("Newsletter fixture has already been cleaned");
        }
        try {
          const existing = await pool.query(
            `SELECT id FROM editorial_staff
              WHERE id = $1 OR email = $2 OR clerk_user_id = $3`,
            [staffId, email, userId],
          );
          if (existing.rowCount !== 0) {
            throw new Error("Temporary editor identity is not isolated");
          }
          await pool.query(
            `INSERT INTO editorial_staff
               (id, email, role, clerk_user_id, created_by_user_id)
             VALUES ($1, $2, 'editor', $3, $3)`,
            [staffId, email, userId],
          );
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "Temporary editor identity is not isolated"
          ) {
            throw error;
          }
          throw new Error("Temporary editor database setup failed");
        }
      },

      async createSignInToken(): Promise<string> {
        if (cleanupComplete) {
          throw new Error("Newsletter fixture has already been cleaned");
        }
        const response = await clerkRequest(secretKey, "/sign_in_tokens", {
          method: "POST",
          body: JSON.stringify({
            user_id: userId,
            expires_in_seconds: 3600,
          }),
        });
        const token =
          response.body &&
          typeof response.body === "object" &&
          "token" in response.body &&
          typeof (response.body as { token?: unknown }).token === "string"
            ? (response.body as { token: string }).token
            : null;
        if (!token) throw new Error("Clerk sign-in token response was invalid");
        return token;
      },

      query(sql: string, values: readonly unknown[] = []) {
        if (cleanupComplete) {
          throw new Error("Newsletter fixture has already been cleaned");
        }
        return pool.query(sql, [...values]).catch(() => {
          throw new Error("Newsletter fixture database query failed");
        });
      },

      async trackSlug(slug: string): Promise<void> {
        if (cleanupComplete) {
          throw new Error("Newsletter fixture has already been cleaned");
        }
        if (
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
          !slug.includes(runId)
        ) {
          throw new Error("Tracked newsletter slug is not unique to this run");
        }
        if (manifest.slugs.includes(slug)) return;
        let existing;
        try {
          existing = await pool.query(
            `SELECT id FROM editorial_items
              WHERE collection = 'newsletters' AND slug = $1`,
            [slug],
          );
        } catch {
          throw new Error("Newsletter slug registration database check failed");
        }
        if (existing.rowCount !== 0) {
          throw new Error("Tracked newsletter slug already exists");
        }
        manifest.slugs.push(slug);
        await saveManifest();
      },

      async trackReferenceUrl(referenceUrl: string): Promise<void> {
        if (cleanupComplete) {
          throw new Error("Newsletter fixture has already been cleaned");
        }
        let parsed: URL;
        try {
          parsed = new URL(referenceUrl);
        } catch {
          throw new Error("Tracked newsletter reference URL is invalid");
        }
        if (
          !referenceUrl.includes(runId) ||
          parsed.protocol !== "https:" ||
          !(
            parsed.hostname === "linkedin.com" ||
            parsed.hostname === "www.linkedin.com"
          ) ||
          !parsed.pathname.startsWith("/pulse/")
        ) {
          throw new Error(
            "Tracked newsletter reference URL is not unique to this run",
          );
        }
        if (manifest.referenceUrls.includes(referenceUrl)) return;
        let existing;
        try {
          existing = await pool.query(
            `SELECT id FROM editorial_items
              WHERE collection = 'newsletters'
                AND (
                  data->>'url' = $1
                  OR data->>'sourceUrl' = $1
                )`,
            [referenceUrl],
          );
        } catch {
          throw new Error(
            "Newsletter reference URL registration database check failed",
          );
        }
        if (existing.rowCount !== 0) {
          throw new Error("Tracked newsletter reference URL already exists");
        }
        manifest.referenceUrls.push(referenceUrl);
        await saveManifest();
      },

      cleanup,
    };
  } catch {
    try {
      await cleanup();
    } catch {
      throw new Error(
        `Newsletter fixture setup failed and cleanup is incomplete for run ${runId}`,
      );
    }
    throw new Error("Newsletter fixture setup failed");
  }
}