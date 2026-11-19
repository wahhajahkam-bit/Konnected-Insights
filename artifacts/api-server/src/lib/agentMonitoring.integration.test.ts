import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
import { startAgentRun, finishAgentRun, inAgentRun, recordAgentOperation, withAgentRun } from "./agentMonitoring";
import { operationsFor, costInfo, adaptHistory, filterSql, historyCoverage, sourceRunDetails, presentOperation } from "./agentMonitoringStore";
import { monitoringFilters } from "./agentMonitoringPolicy";

test("isolated durable monitoring: dedupe, parent costs, history, filters, fail-open", async () => {
  const client = await pool.connect();
  const original = pool.query;
  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA agent_monitoring_test");
    await client.query("SET LOCAL search_path TO agent_monitoring_test");
    await client.query(await readFile("../../lib/db/migrations/agent-monitoring.sql", "utf8"));
    // All service queries execute in an isolated transaction, rolled back after this test.
    pool.query = client.query.bind(client) as typeof pool.query;
    const root = await startAgentRun({ agentId: "gmail-automation", sourceId: "durable-1" });
    assert.ok(root);
    assert.equal(await startAgentRun({ agentId: "gmail-automation", sourceId: "durable-1" }), root);
    await inAgentRun(root, async () => {
      await withAgentRun({ agentId: "editorial-draft" }, async child => {
        const operation = { runId: child, key: "call-1", inputTokens: 100, inputTextTokens: 80, inputImageTokens: 20, outputTextTokens: 0, outputImageTokens: 50, costAmount: 0.01, currency: "USD" };
        await recordAgentOperation(operation);
        await recordAgentOperation(operation);
        await recordAgentOperation({ runId: child, key: "unknown-call", outputTokens: 20 });
      });
    });
    const operations = await operationsFor([root]);
    assert.equal(operations.length, 2);
    const modality = operations.find(o => o.key === "call-1");
    const unknown = operations.find(o => o.key === "unknown-call");
    assert.equal(Number(modality.input_text_tokens), 80);
    assert.equal(Number(modality.input_image_tokens), 20);
    assert.equal(Number(modality.output_text_tokens), 0);
    assert.equal(Number(modality.output_image_tokens), 50);
    assert.equal(unknown.input_image_tokens, null);
    assert.equal(presentOperation(modality).inputTextTokens, 80);
    assert.equal(presentOperation(unknown).inputImageTokens, null);
    const row = (await client.query("SELECT * FROM agent_runs WHERE id=$1", [root])).rows[0];
    assert.equal(costInfo(row, operations).costStatus, "partial");
    assert.equal(costInfo(row, operations).costs[0].amount, 0.01);
    await finishAgentRun(root, { status: "failed", outcome: "https://private.example/secret" });
    assert.equal((await client.query("SELECT outcome FROM agent_runs WHERE id=$1", [root])).rows[0].outcome, null);
    const { where, values } = filterSql(monitoringFilters.parse({ agentId: "gmail-automation", status: "failed" }));
    assert.equal((await client.query(`SELECT * FROM agent_runs WHERE ${where}`, values)).rowCount, 1);
    await client.query("CREATE TABLE research_log(id uuid,status text,started_at timestamptz,finished_at timestamptz,usage jsonb)");
    await client.query(`INSERT INTO research_log VALUES(gen_random_uuid(),'completed',now(),now(),
      '[{"stage":"summary","prompt_tokens":50,"completion_tokens":20,"prompt":"never expose","model":"unknown-guess"}]')`);
    await adaptHistory(); await adaptHistory();
    const historical = (await client.query("SELECT * FROM agent_runs WHERE provenance='historical'")).rows;
    assert.equal(historical.length, 1);
    const historicalOps = await operationsFor([historical[0].id]);
    assert.equal(historicalOps.length, 1);
    assert.equal(Number(historicalOps[0].input_tokens), 50);
    assert.equal(historicalOps[0].model, null);
    assert.equal(historicalOps[0].cost_amount, null);
    assert.deepEqual((await sourceRunDetails(historical[0])).outputs, [{ label: "Research history", path: "/admin/research" }]);
    await client.query(`CREATE TABLE newsletter_source_runs(id uuid,status text,started_at timestamptz,completed_at timestamptz,
      fetched integer,created integer,skipped integer,failed integer,drafts jsonb)`);
    await client.query("CREATE TABLE editorial_items(id uuid,collection text)");
    const draftId = "11111111-1111-4111-8111-111111111111";
    await client.query("INSERT INTO editorial_items VALUES($1,'newsletters')", [draftId]);
    await client.query(`INSERT INTO newsletter_source_runs SELECT gen_random_uuid(),'succeeded',now(),now(),3,1,2,0,$1::jsonb FROM generate_series(1,501)`,
      [JSON.stringify([{ id: draftId, title: "Private title must not escape" }, { id: "unsafe-url" }])]);
    assert.equal((await historyCoverage()).remainingRuns, 501);
    await adaptHistory();
    assert.equal((await historyCoverage()).complete, false);
    assert.equal((await historyCoverage()).remainingRuns, 1);
    const newsletterRun = (await client.query("SELECT * FROM agent_runs WHERE agent_id='newsletter-ingestion' LIMIT 1")).rows[0];
    const sourceDetail = await sourceRunDetails(newsletterRun);
    assert.deepEqual(sourceDetail.counts, { fetched: 3, created: 1, skipped: 2, failed: 0 });
    assert.deepEqual(sourceDetail.outputs, [{ label: "Newsletter draft", path: `/admin?newsletterId=${draftId}` }]);
    assert.equal(JSON.stringify(sourceDetail).includes("Private"), false);
    await adaptHistory();
    assert.equal((await historyCoverage()).complete, true);
    pool.query = (async () => { throw new Error("database down"); }) as typeof pool.query;
    assert.equal(await startAgentRun({ agentId: "editorial-draft" }), null);
    assert.equal(await withAgentRun({ agentId: "editorial-draft" }, async () => "business succeeds"), "business succeeds");
    await assert.rejects(withAgentRun({ agentId: "editorial-draft" }, async () => { throw new Error("original business error"); }), /original business error/);
  } finally {
    pool.query = original;
    await client.query("ROLLBACK"); client.release(); await pool.end();
  }
});