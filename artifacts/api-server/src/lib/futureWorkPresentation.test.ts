import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import router from "../routes/future-work";
import { requireEditorialStaff } from "../middlewares/requireEditorialStaff";
import { futureWorkPresentation } from "./futureWorkPresentation";

after(async () => { await pool.end(); });

// Invoke the actual route handlers without starting an application or bypassing
// the separately asserted authentication boundary in production.
const stack = (router as any).stack;
async function invoke(method: string, path: string, body: unknown, params = {}) {
  const layer = stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer);
  const response = {
    statusCode: 200, body: undefined as any, locals: {},
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
  await layer.route.stack[0].handle({ body, params }, response);
  return response;
}

test("presentation is bounded, optional framing with strict media and alt validation", () => {
  assert.deepEqual(futureWorkPresentation.parse({}), {});
  for (const heroCoverUrl of ["/api/editorial/images/cover.jpg", "/editorial/generated/cover.jpg", "https://example.org/cover.jpg"]) {
    assert.equal(futureWorkPresentation.safeParse({ heroCoverUrl, heroAlt: "Descriptive cover" }).success, true);
    assert.equal(futureWorkPresentation.safeParse({ heroCoverUrl }).success, false);
    assert.equal(futureWorkPresentation.safeParse({ heroCoverUrl, heroAlt: " " }).success, false);
  }
  for (const heroCoverUrl of ["javascript:alert(1)", "data:image/png;base64,x", "//example.org/x", "/\\evil.test/x", "https://user:pass@example.org/x", "not-a-url", "https://"]) {
    assert.equal(futureWorkPresentation.safeParse({ heroCoverUrl, heroAlt: "Cover" }).success, false, heroCoverUrl);
  }
  for (const input of [
    { shortIntroduction: "x".repeat(1001) }, { heroAlt: "x".repeat(301) },
    { heroCredit: "x".repeat(301) }, { sectionIntroductions: { outlook: "x".repeat(601) } },
    { sources: [] }, { skills: ["claim"] }, { status: "published" },
    { sectionIntroductions: { claims: "unsupported" } },
  ]) assert.equal(futureWorkPresentation.safeParse(input).success, false);
});

test("all function writes remain behind the existing database-backed staff guard", async () => {
  const guardIndex = stack.findIndex((entry: any) => entry.handle === requireEditorialStaff);
  assert.ok(guardIndex >= 0);
  for (const path of ["/editorial/future-work/functions", "/editorial/future-work/functions/:id"]) {
    assert.ok(stack.findIndex((entry: any) => entry.route?.path === path) > guardIndex);
  }
  let nextCalled = false;
  const response = {
    code: 200, body: undefined as any,
    status(code: number) { this.code = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  const signedOutAuth = Object.assign(
    () => ({ userId: null, sessionClaims: null, tokenType: "session_token" }),
    { [Symbol.for("@clerk/express.auth")]: true },
  );
  await requireEditorialStaff(
    { auth: signedOutAuth } as any,
    response as any,
    () => { nextCalled = true; },
  );
  assert.equal(response.code, 401);
  assert.equal(nextCalled, false);
});

test("function presentation saves, reloads publicly, preserves omissions, clears explicitly and rejects stale revisions", async () => {
  const slug = `presentation-test-${randomUUID()}`;
  const presentation = {
    heroCoverUrl: "/editorial/generated/test.jpg", heroAlt: "Test fixture cover",
    heroCredit: "Fixture credit", shortIntroduction: "Editorial introduction.",
    sectionIntroductions: { overview: "Overview framing.", outlook: "Outlook framing.", skills: "Skills framing.", news: "News framing.", programs: "Programs framing.", sources: "Sources framing." },
  };
  const created = await invoke("post", "/editorial/future-work/functions", { slug, name: "Presentation test fixture", presentation });
  assert.equal(created.statusCode, 201);
  const id = created.body.data.id;
  try {
    assert.deepEqual(created.body.data.presentation, presentation);
    const reload = await invoke("get", "/future-work/functions/:slug", undefined, { slug });
    assert.equal(reload.statusCode, 200);
    assert.deepEqual(reload.body.data.function.presentation, presentation);
    const invalid = await invoke("patch", "/editorial/future-work/functions/:id", { revision: 1, presentation: { heroCoverUrl: "/cover.jpg" } }, { id });
    assert.equal(invalid.statusCode, 400);
    const renamed = await invoke("patch", "/editorial/future-work/functions/:id", { revision: 1, name: "Renamed fixture" }, { id });
    assert.equal(renamed.statusCode, 200);
    assert.deepEqual(renamed.body.data.presentation, presentation);
    const stale = await invoke("patch", "/editorial/future-work/functions/:id", { revision: 1, presentation: {} }, { id });
    assert.equal(stale.statusCode, 409);
    const cleared = await invoke("patch", "/editorial/future-work/functions/:id", { revision: 2, presentation: {} }, { id });
    assert.equal(cleared.statusCode, 200);
    assert.deepEqual(cleared.body.data.presentation, {});
    const stored = (await pool.query("SELECT presentation,revision FROM future_work_functions WHERE id=$1", [id])).rows[0];
    assert.deepEqual(stored, { presentation: {}, revision: 3 });
  } finally {
    await pool.query("DELETE FROM future_work_functions WHERE id=$1", [id]);
  }
});