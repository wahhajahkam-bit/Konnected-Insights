import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import express from "express";
import { pool } from "@workspace/db";
import router from "../routes/agent-monitoring";

test("real HTTP admin enforcement, manual CRUD/audit persistence, validation and pagination", async () => {
  const client = await pool.connect();
  const originalQuery = pool.query, originalConnect = pool.connect;
  const schema = `agent_http_${randomUUID().replace(/-/g, "")}`;
  const app = express();
  app.use(express.json()); app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/editorial/agents`;
  const request = async (path = "", method = "GET", user?: string, body?: unknown) => {
    const response = await fetch(url + path, { method, headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": user } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(await readFile("../../lib/db/migrations/agent-monitoring.sql", "utf8"));
    await client.query(`CREATE TABLE editorial_staff(id uuid DEFAULT gen_random_uuid(),email text,role text,clerk_user_id text,
      clerk_invitation_id text,clerk_invitation_expires_at timestamptz,invitation_claim_token uuid,
      created_by_user_id text,created_at timestamptz,updated_at timestamptz)`);
    await client.query(`INSERT INTO editorial_staff(email,role,clerk_user_id) VALUES
      ('admin@monitoring.test','admin','admin'),('editor@monitoring.test','editor','editor'),('owner@monitoring.test','owner','owner')`);
    pool.query = client.query.bind(client) as typeof pool.query;
    pool.connect = (async () => ({ query: client.query.bind(client), release() {} })) as typeof pool.connect;
    for (const [user, expected] of [[undefined, 401], ["outsider", 403], ["editor", 403]] as const) {
      for (const [path, method] of [["", "GET"], ["/summary", "GET"], ["/runs", "GET"], ["/manual", "POST"], [`/manual/${randomUUID()}`, "PATCH"], [`/manual/${randomUUID()}`, "DELETE"], [`/runs/${randomUUID()}`, "GET"]]) {
        assert.equal((await request(path, method, user, method === "POST" || method === "PATCH" ? {} : undefined)).status, expected);
      }
    }
    assert.equal((await request("", "GET", "owner")).status, 200);
    const input = { label: "Manual development session", startedAt: "2026-01-02T10:00:00Z", durationMs: 60000, costAmount: 1.25, currency: "USD", reference: "Session reference", notes: "Reported by admin" };
    for (const invalid of [{ ...input, enteredBy: "fake" }, { ...input, durationMs: -1 }, { ...input, currency: undefined }, { ...input, finishedAt: "2026-01-02T11:00:00Z" }]) {
      assert.equal((await request("/manual", "POST", "admin", invalid)).status, 400);
    }
    const created = await request("/manual", "POST", "admin", input);
    assert.equal(created.status, 201);
    const id = created.body.data.id;
    assert.equal(created.body.data.enteredBy, "admin");
    assert.equal(created.body.data.costStatus, "priced");
    assert.equal(created.body.data.elapsedMs, 60000);
    assert.equal((await client.query("SELECT count(*) FROM agent_runs WHERE id=$1", [id])).rows[0].count, "1");
    assert.equal((await request(`/manual/${id}`, "PATCH", "owner", { ...input, label: "Updated session", costAmount: 2 })).status, 200);
    const detail = await request(`/runs/${id}`, "GET", "admin");
    assert.equal(detail.body.data.run.label, "Updated session");
    assert.equal(detail.body.data.run.enteredBy, "admin");
    assert.equal(detail.body.data.run.updatedBy, "owner");
    assert.deepEqual(detail.body.data.audit.map((a: any) => [a.action, a.actor]), [["created", "admin"], ["updated", "owner"]]);
    await request("/manual", "POST", "admin", { ...input, label: "Second", costAmount: undefined, currency: undefined });
    const page1 = await request("/runs?category=replit&page=1&pageSize=1", "GET", "admin");
    const page2 = await request("/runs?category=replit&page=2&pageSize=1", "GET", "admin");
    assert.equal(page1.body.data.total, 2);
    assert.notEqual(page1.body.data.items[0].id, page2.body.data.items[0].id);
    for (const query of ["page=0", "pageSize=101", "agentId=bad", "from=bad"]) assert.equal((await request(`/runs?${query}`, "GET", "admin")).status, 400);
    const summary = await request("/summary?category=replit", "GET", "admin");
    assert.equal(summary.body.data.runs, 2);
    assert.equal(summary.body.data.unknownCostRuns, 1);
    assert.equal(summary.body.data.costs[0].amount, 2);
    assert.equal((await request(`/manual/${id}`, "DELETE", "admin")).status, 200);
    assert.equal((await request(`/runs/${id}`, "GET", "admin")).status, 404);
    assert.equal((await request(`/manual/${id}`, "PATCH", "admin", input)).status, 404);
    assert.equal((await client.query("SELECT count(*) FROM agent_manual_audit WHERE run_id=$1", [id])).rows[0].count, "3");
    assert.equal((await request("/runs?category=replit", "GET", "admin")).body.data.total, 1);
  } finally {
    pool.query = originalQuery; pool.connect = originalConnect;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    client.release(); await pool.end();
  }
});