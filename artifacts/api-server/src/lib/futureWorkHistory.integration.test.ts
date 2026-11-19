import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { assertSavedSourceTestEnvironment } from "../../../../scripts/saved-source-test-guard.mjs";
import {
  decodeHistoryCursor,
  listEditorialDecisions,
  listResearchRuns,
  readVersionHistory,
  type HistoryCategory,
} from "./futureWorkHistory";
import type { Kind } from "./futureWorkStore";

assertSavedSourceTestEnvironment();

const categories: HistoryCategory[] = ["all", "2030", "2050", "2100", "news", "programs"];
const filteredCategories = categories.filter((category): category is Exclude<HistoryCategory, "all"> => category !== "all");
const functionA = randomUUID();
const functionB = randomUUID();
const noMatchFunction = randomUUID();
const originalQuery = pool.query;
// Calling through this zero-argument wrapper selects pg's promise overload;
// ReturnType<typeof pool.connect> instead resolves to its callback overload.
const connectForTest = () => pool.connect();
let client: Awaited<ReturnType<typeof connectForTest>>;

function combination(category: Exclude<HistoryCategory, "all">, functionId: string) {
  return category === "news" || category === "programs"
    ? { functionId, kind: category }
    : { functionId, kind: "content", horizon: category };
}

function kindFor(category: Exclude<HistoryCategory, "all">): Kind {
  return category === "news" || category === "programs" ? category : "content";
}

function tableFor(kind: Kind) {
  return kind === "content" ? "future_of_work_content" : kind === "programs" ? "leading_programs" : "future_work_news";
}

function decisionId(item: { kind: unknown; version: unknown }): string {
  assert.ok("id" in item && typeof item.id === "string", "history decision must include its id");
  return item.id;
}

async function insertVersion(options: {
  id?: string;
  functionId: string;
  category: Exclude<HistoryCategory, "all">;
  data?: Record<string, unknown>;
  previousVersionId?: string | null;
}) {
  const kind = kindFor(options.category);
  const id = options.id ?? randomUUID();
  const horizon = ["2030", "2050", "2100"].includes(options.category) ? Number(options.category) : 2030;
  const slot = `${options.functionId}:${kind}:${options.category}:${id}`;
  await client.query(
    `INSERT INTO ${tableFor(kind)}
       (id,function_id,horizon,lens,slot,status,data,previous_version_id)
     VALUES($1,$2,$3,'technology',$4,'pending_review',$5,$6)`,
    [id, options.functionId, horizon, slot, options.data ?? {}, options.previousVersionId ?? null],
  );
  return { id, kind };
}

before(async () => {
  client = await pool.connect();

  // Exercise the production union against the current development schema before
  // installing transaction-local shadow tables.
  await client.query(`SELECT d.*,row_to_json(v) AS version_record
    FROM future_work_decisions d
    JOIN (
      SELECT 'content'::text AS joined_kind,v.* FROM future_of_work_content v
      UNION ALL SELECT 'programs'::text AS joined_kind,v.* FROM leading_programs v
      UNION ALL SELECT 'news'::text AS joined_kind,v.* FROM future_work_news v
    ) v ON v.joined_kind=d.kind AND v.id=d.version_id
    ORDER BY d.created_at DESC,d.id DESC LIMIT 1`);

  await client.query("BEGIN");
  for (const table of [
    "research_log",
    "future_work_decisions",
    "future_of_work_content",
    "leading_programs",
    "future_work_news",
  ]) {
    await client.query(
      `CREATE TEMP TABLE ${table}
       (LIKE public.${table} INCLUDING DEFAULTS, PRIMARY KEY(id)) ON COMMIT DROP`,
    );
  }
  (pool as any).query = (...args: any[]) => (client as any).query(...args);

  let minute = 0;
  for (const functionId of [functionA, functionB]) {
    for (const category of filteredCategories) {
      const startedAt = `2025-02-01T12:${String(minute++).padStart(2, "0")}:00.123456Z`;
      await client.query(
        `INSERT INTO research_log(id,schedule_id,status,started_at,lease_until,results,plan)
         VALUES($1,$2,'completed',$3,$3,$4,'[]'::jsonb)`,
        [
          randomUUID(),
          category,
          startedAt,
          JSON.stringify([{ outcome: "published", combination: combination(category, functionId) }]),
        ],
      );
      const version = await insertVersion({
        functionId,
        category,
        data: { sources: [{ url: `https://evidence.example/${functionId}/${category}` }] },
      });
      await client.query(
        `INSERT INTO future_work_decisions(id,kind,version_id,action,actor,reason,created_at)
         VALUES($1,$2,$3,'approve','integration-test',$4,$5)`,
        [randomUUID(), version.kind, version.id, `${functionId}:${category}`, startedAt],
      );
    }
  }
});

after(async () => {
  (pool as any).query = originalQuery;
  if (client) {
    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }
  await pool.end();
});

test("real queries cover all/specific-function by every history category and no match", { concurrency: false }, async () => {
  for (const category of categories) {
    const expectedAll = category === "all" ? 10 : 2;
    const expectedSpecific = category === "all" ? 5 : 1;

    const allRuns = await listResearchRuns({ category, limit: 100 });
    const specificRuns = await listResearchRuns({ category, functionId: functionA, limit: 100 });
    const allDecisions = await listEditorialDecisions({ category, limit: 100 });
    const specificDecisions = await listEditorialDecisions({ category, functionId: functionA, limit: 100 });

    assert.equal(allRuns.items.length, expectedAll, `all-function run count for ${category}`);
    assert.equal(specificRuns.items.length, expectedSpecific, `specific-function run count for ${category}`);
    assert.equal(allDecisions.items.length, expectedAll, `all-function decision count for ${category}`);
    assert.equal(specificDecisions.items.length, expectedSpecific, `specific-function decision count for ${category}`);
  }

  assert.deepEqual(
    await listResearchRuns({ category: "all", functionId: noMatchFunction, limit: 100 }),
    { items: [], nextCursor: null },
  );
  assert.deepEqual(
    await listEditorialDecisions({ category: "all", functionId: noMatchFunction, limit: 100 }),
    { items: [], nextCursor: null },
  );
});

test("real keyset query covers over 200 decisions with microseconds and tied timestamps exactly once", { concurrency: false }, async () => {
  const paginationFunction = randomUUID();
  const version = await insertVersion({
    functionId: paginationFunction,
    category: "2030",
    data: { sources: [{ url: "https://evidence.example/pagination" }] },
  });
  const decisionIds = Array.from({ length: 205 }, () => randomUUID());
  const timestamps = decisionIds.map((_, index) =>
    index < 103 ? "2025-04-05T06:07:08.123456Z" : "2025-04-05T06:07:08.123455Z",
  );
  await client.query(
    `INSERT INTO future_work_decisions(id,kind,version_id,action,actor,reason,created_at)
     SELECT id,'content',$1,'approve','pagination-test','precise keyset fixture',created_at
     FROM unnest($2::uuid[],$3::timestamptz[]) AS fixture(id,created_at)`,
    [version.id, decisionIds, timestamps],
  );

  const expected = (await client.query(
    `SELECT id FROM future_work_decisions
     WHERE version_id=$1 ORDER BY created_at DESC,id DESC`,
    [version.id],
  )).rows.map((row: { id: string }) => row.id);
  const actual: string[] = [];
  const cursorTimes: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await listEditorialDecisions({
      category: "all",
      functionId: paginationFunction,
      limit: 17,
      cursor,
    });
    actual.push(...page.items.map(decisionId));
    cursor = page.nextCursor ?? undefined;
    if (cursor) cursorTimes.push(decodeHistoryCursor(cursor, "decisions")!.time);
  } while (cursor);

  assert.equal(actual.length, 205);
  assert.equal(new Set(actual).size, 205);
  assert.deepEqual(actual, expected);
  assert.ok(cursorTimes.some(time => time.endsWith(".123456Z")));
  assert.ok(cursorTimes.some(time => time.endsWith(".123455Z")));
});

test("all three version kinds preserve decisions, evidence, and predecessor evidence", { concurrency: false }, async () => {
  for (const [kind, category] of [
    ["content", "2050"],
    ["programs", "programs"],
    ["news", "news"],
  ] as const) {
    const functionId = randomUUID();
    const previous = await insertVersion({
      functionId,
      category,
      data: {
        sources: [{ url: `https://evidence.example/${kind}/previous`, excerpt: "Earlier evidence" }],
        supportingQuotes: [`${kind} predecessor quote`],
        runId: randomUUID(),
      },
    });
    const current = await insertVersion({
      functionId,
      category,
      previousVersionId: previous.id,
      data: {
        sources: [{ url: `https://evidence.example/${kind}/current`, excerpt: "Current evidence" }],
        supportingQuotes: [`${kind} current quote`],
        runId: randomUUID(),
      },
    });
    await client.query(
      `INSERT INTO future_work_decisions(kind,version_id,action,actor,reason)
       VALUES($1,$2,'reject','integration-test',$3)`,
      [kind, current.id, `${kind} evidence decision`],
    );

    const history = await readVersionHistory(kind, current.id);
    assert.equal(history.version.sources[0].url, `https://evidence.example/${kind}/current`);
    assert.deepEqual(history.version.supportingQuotes, [`${kind} current quote`]);
    assert.equal(history.decisions[0].reason, `${kind} evidence decision`);
    assert.equal(history.previousVersion?.id, previous.id);
    assert.equal(history.previousVersion?.sources[0].url, `https://evidence.example/${kind}/previous`);
    assert.deepEqual(history.previousVersion?.supportingQuotes, [`${kind} predecessor quote`]);
  }
});