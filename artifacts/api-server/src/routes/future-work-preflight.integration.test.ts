import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { clerkClient } from "@clerk/express";
import { pool } from "@workspace/db";
import express from "express";
import router from "./future-work";
import { assertSavedSourceTestEnvironment } from "../../../../scripts/saved-source-test-guard.mjs";

assertSavedSourceTestEnvironment();

let server: Server;
let baseUrl: string;
const observedStaffLocals = new Map<string, unknown>();
const originalGetUser = clerkClient.users.getUser;

function auth(userId: string | null) {
  return Object.assign(
    () => ({ userId, sessionClaims: userId ? { userId } : null, tokenType: "session_token" }),
    { [Symbol.for("@clerk/express.auth")]: true },
  );
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const userId = req.header("x-test-user-id") || null;
    const requestId = req.header("x-test-request-id");
    (req as any).auth = auth(userId);
    const sendJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (requestId) observedStaffLocals.set(requestId, res.locals.staffUserId);
      return sendJson(body);
    }) as typeof res.json;
    next();
  });
  app.use(router);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  (clerkClient.users as any).getUser = originalGetUser;
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
  await pool.end();
});

async function request(
  path: string,
  options: { method?: string; body?: unknown; userId?: string; requestId?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.userId) headers["x-test-user-id"] = options.userId;
  if (options.requestId) headers["x-test-request-id"] = options.requestId;
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.json() as any,
  };
}

async function sideEffectSnapshot() {
  return (await pool.query(`
    SELECT jsonb_build_object(
      'runs', (SELECT count(*) FROM research_log),
      'evidence', (SELECT count(*) FROM future_work_evidence),
      'contentVersions', (SELECT count(*) FROM future_of_work_content),
      'programVersions', (SELECT count(*) FROM leading_programs),
      'newsVersions', (SELECT count(*) FROM future_work_news),
      'decisions', (SELECT count(*) FROM future_work_decisions),
      'publishedContent', (SELECT count(*) FROM future_of_work_content WHERE status='published'),
      'publishedPrograms', (SELECT count(*) FROM leading_programs WHERE status='published'),
      'publishedNews', (SELECT count(*) FROM future_work_news WHERE status='published'),
      'schedules', (
        SELECT jsonb_agg(to_jsonb(schedule) ORDER BY schedule.id)
        FROM future_work_schedules schedule
      )
    ) AS state
  `)).rows[0].state;
}

test("actual preflight HTTP route rejects signed-out and nonstaff users", { concurrency: false }, async () => {
  const signedOut = await request(
    `/editorial/future-work/functions/${randomUUID()}/source-preflight`,
    { method: "POST", body: { revision: 1, sourceIndex: 0 } },
  );
  assert.equal(signedOut.status, 401);
  assert.equal(signedOut.body.error.code, "UNAUTHORIZED");

  (clerkClient.users as any).getUser = async () => ({
    emailAddresses: [],
    publicMetadata: {},
  });
  const nonstaff = await request(
    `/editorial/future-work/functions/${randomUUID()}/source-preflight`,
    {
      method: "POST",
      body: { revision: 1, sourceIndex: 0 },
      userId: `preflight-nonstaff-${randomUUID()}`,
    },
  );
  assert.equal(nonstaff.status, 403);
  assert.equal(nonstaff.body.error.code, "STAFF_ACCESS_DENIED");
});

test("staff can preflight each saved URL without runs, versions, publications, or schedule changes", { concurrency: false }, async () => {
  const suffix = randomUUID();
  const userId = `preflight-staff-${suffix}`;
  const email = `preflight-${suffix}@example.test`;
  let functionId: string | undefined;

  await pool.query(
    `INSERT INTO editorial_staff(email,role,clerk_user_id,created_by_user_id)
     VALUES($1,'editor',$2,$2)`,
    [email, userId],
  );
  (clerkClient.users as any).getUser = async () => ({
    emailAddresses: [{ emailAddress: email, verification: { status: "verified" } }],
    publicMetadata: {},
  });

  try {
    const firstUrl = "http://127.0.0.1/saved-source-one";
    const secondUrl = "http://127.0.0.1/saved-source-two";
    const createRequestId = randomUUID();
    const created = await request("/editorial/future-work/functions", {
      method: "POST",
      userId,
      requestId: createRequestId,
      body: {
        slug: `preflight-${suffix}`,
        name: "Saved-source preflight integration fixture",
        researchSources: {
          urls: [firstUrl, secondUrl],
          instructions: "Use only these explicitly saved sources.",
        },
      },
    });
    assert.equal(created.status, 201);
    assert.equal(observedStaffLocals.get(createRequestId), userId);
    functionId = created.body.data.id;

    const before = await sideEffectSnapshot();
    for (const [sourceIndex, expectedUrl] of [firstUrl, secondUrl].entries()) {
      const requestId = randomUUID();
      const result = await request(
        `/editorial/future-work/functions/${functionId}/source-preflight`,
        { method: "POST", userId, requestId, body: { revision: 1, sourceIndex } },
      );
      assert.equal(result.status, 200);
      assert.equal(observedStaffLocals.get(requestId), userId);
      assert.equal(result.headers.get("cache-control"), "no-store");
      assert.equal(result.body.data.url, expectedUrl);
      assert.equal(result.body.data.retrieval, "failed");
      assert.match(result.body.data.disclaimer, /No research, publication, or schedule changes are performed/);
    }

    const stale = await request(
      `/editorial/future-work/functions/${functionId}/source-preflight`,
      { method: "POST", userId, body: { revision: 2, sourceIndex: 0 } },
    );
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, "CONFLICT");
    assert.match(stale.body.error.message, /Saved sources changed; reload/);
    assert.deepEqual(await sideEffectSnapshot(), before);
  } finally {
    if (functionId) await pool.query("DELETE FROM future_work_functions WHERE id=$1", [functionId]);
    await pool.query("DELETE FROM editorial_staff WHERE clerk_user_id=$1", [userId]);
  }
});