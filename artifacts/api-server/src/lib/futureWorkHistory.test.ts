import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "@workspace/db";
import {
  decodeHistoryCursor,
  encodeHistoryCursor,
  historyQuerySchema,
  listEditorialDecisions,
  listResearchRuns,
  readVersionHistory,
} from "./futureWorkHistory";

const uuid = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
const preciseTime = "2025-01-02T03:04:05.123456Z";

test("history query validation and cursor are strict and preserve PostgreSQL precision", () => {
  assert.deepEqual(historyQuerySchema.parse({}), { category: "all", limit: 20 });
  assert.throws(() => historyQuerySchema.parse({ category: "other" }));
  assert.throws(() => historyQuerySchema.parse({ limit: "101" }));
  assert.throws(() => historyQuerySchema.parse({ functionId: "not-an-id" }));
  const cursor = encodeHistoryCursor("runs", preciseTime, uuid(1));
  assert.equal(decodeHistoryCursor(cursor, "runs")?.time, preciseTime);
  assert.throws(() => decodeHistoryCursor(cursor, "decisions"));
  assert.throws(() => decodeHistoryCursor("not+base64", "runs"));
});

test("keyset pagination covers more than 50 runs and 200 joined decisions without duplicates", { concurrency: false }, async () => {
  const originalQuery = pool.query;
  const ids = Array.from({ length: 205 }, (_, index) => uuid(205 - index));
  (pool as any).query = async (sql: string, values: unknown[]) => {
    const isDecision = sql.includes("future_work_decisions");
    const cursorId = values.find(value => typeof value === "string" && /^00000000-/.test(value)) as string | undefined;
    const limit = values.at(-1) as number;
    const selected = ids.filter(id => !cursorId || id < cursorId).slice(0, limit);
    return {
      rows: selected.map((id, index) => isDecision ? {
        id, kind: "content", version_id: uuid(9000 + index), action: "reject",
        actor: "editor", reason: `reason ${id}`, created_at: new Date(preciseTime),
        cursor_time: preciseTime,
        version_record: {
          joined_kind: "content", id: uuid(9000 + index), function_id: uuid(500),
          horizon: 2030, lens: "technology", slot: `slot-${id}`, status: "rejected",
          data: { sources: [{ url: "https://example.com/evidence" }], supportingQuotes: ["Evidence"] },
          revision: 1, previous_version_id: null, updated_at: new Date(preciseTime),
        },
      } : {
        id, schedule_id: "2030", status: "completed", started_at: new Date(preciseTime),
        cursor_time: preciseTime, results: [], plan: [],
      }),
    };
  };
  try {
    const runIds: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listResearchRuns({ category: "all", limit: 100, cursor });
      runIds.push(...page.items.map(item => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.equal(runIds.length, 205);
    assert.equal(new Set(runIds).size, 205);

    const decisionIds: string[] = [];
    cursor = undefined;
    do {
      const page = await listEditorialDecisions({ category: "all", limit: 100, cursor });
      decisionIds.push(...page.items.map((item: any) => item.id));
      assert.ok(page.items.every(item => item.kind === "content" && item.version?.sources?.length === 1));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.equal(decisionIds.length, 205);
    assert.equal(new Set(decisionIds).size, 205);
  } finally {
    (pool as any).query = originalQuery;
  }
});

test("run filters require one result combination to satisfy function and category", { concurrency: false }, async () => {
  const originalQuery = pool.query;
  let captured = { sql: "", values: [] as unknown[] };
  (pool as any).query = async (sql: string, values: unknown[]) => {
    captured = { sql, values };
    return { rows: [] };
  };
  try {
    await listResearchRuns({ functionId: uuid(44), category: "2050", limit: 20 });
    assert.equal((captured.sql.match(/EXISTS/g) ?? []).length, 1);
    assert.match(captured.sql, /combination,functionId/);
    assert.match(captured.sql, /combination,horizon/);
    assert.deepEqual(captured.values, [uuid(44), "2050", 21]);
  } finally {
    (pool as any).query = originalQuery;
  }
});

test("exact version detail preserves rejection reason and predecessor evidence", { concurrency: false }, async () => {
  const originalQuery = pool.query;
  const currentId = uuid(71);
  const previousId = uuid(70);
  let call = 0;
  (pool as any).query = async () => {
    call += 1;
    if (call === 1) return { rows: [{
      id: currentId, function_id: uuid(2), horizon: 2030, lens: "field", slot: "evidence",
      status: "rejected", data: { sources: [{ url: "https://current.example/report.pdf" }] },
      revision: 1, previous_version_id: previousId,
    }] };
    if (call === 2) return { rows: [{
      id: uuid(80), kind: "content", version_id: currentId, action: "reject",
      actor: "staff", reason: "Evidence did not support the claim", created_at: new Date(),
    }] };
    return { rows: [{
      id: previousId, function_id: uuid(2), horizon: 2030, lens: "field", slot: "evidence",
      status: "published", data: { sources: [{ url: "https://previous.example/report.pdf" }], supportingQuotes: ["Previous evidence"] },
      revision: 2, previous_version_id: null,
    }] };
  };
  try {
    const detail = await readVersionHistory("content", currentId);
    assert.equal(detail.version.id, currentId);
    assert.equal(detail.decisions[0].reason, "Evidence did not support the claim");
    assert.equal(detail.previousVersion?.sources[0].url, "https://previous.example/report.pdf");
    assert.deepEqual(detail.previousVersion?.supportingQuotes, ["Previous evidence"]);
  } finally {
    (pool as any).query = originalQuery;
  }
});