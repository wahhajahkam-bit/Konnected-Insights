import { pool } from "@workspace/db";
import { z } from "zod/v4";
import { camel, FutureWorkError, tables, version, type Kind } from "./futureWorkStore";

export const historyCategory = z.enum(["all", "2030", "2050", "2100", "news", "programs"]);
export type HistoryCategory = z.infer<typeof historyCategory>;
export const historyQuerySchema = z.object({
  functionId: z.string().uuid().optional(),
  category: historyCategory.default("all"),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const cursorPayload = z.object({
  resource: z.enum(["runs", "decisions"]),
  time: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
}).strict();

type HistoryResource = z.infer<typeof cursorPayload>["resource"];
type Cursor = z.infer<typeof cursorPayload>;

export function encodeHistoryCursor(resource: HistoryResource, time: Date | string, id: string) {
  return Buffer.from(JSON.stringify({
    resource,
    // PostgreSQL timestamps carry microseconds. Preserve the server-formatted
    // string rather than round-tripping it through JavaScript's millisecond Date.
    time: typeof time === "string" ? time : time.toISOString(),
    id,
  }), "utf8").toString("base64url");
}

export function decodeHistoryCursor(value: string | undefined, resource: HistoryResource): Cursor | null {
  if (value === undefined) return null;
  try {
    // Bound the decoded input and require canonical base64url so malformed values
    // cannot become surprising database predicates.
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 512) throw new Error("invalid");
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = cursorPayload.parse(JSON.parse(decoded));
    if (parsed.resource !== resource || encodeHistoryCursor(parsed.resource, parsed.time, parsed.id) !== value) {
      throw new Error("invalid");
    }
    return parsed;
  } catch {
    throw new FutureWorkError(400, "Invalid history cursor");
  }
}

export type HistoryQuery = z.infer<typeof historyQuerySchema>;

export async function listResearchRuns(input: HistoryQuery) {
  const cursor = decodeHistoryCursor(input.cursor, "runs");
  const values: unknown[] = [];
  const where: string[] = [];
  if (input.functionId || input.category !== "all") {
    const functionParam = input.functionId ? `$${values.push(input.functionId)}::uuid` : null;
    const categoryParam = input.category !== "all" ? `$${values.push(input.category)}::text` : null;
    where.push(`EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(r.results)='array' THEN r.results ELSE '[]'::jsonb END
      ) result
      WHERE jsonb_typeof(result)='object'
        ${functionParam ? `AND result #>> '{combination,functionId}' = ${functionParam}::text` : ""}
        ${categoryParam ? `AND CASE WHEN result #>> '{combination,kind}'='content'
          THEN result #>> '{combination,horizon}' ELSE result #>> '{combination,kind}' END = ${categoryParam}` : ""}
    )`);
  }
  if (cursor) {
    const timeParam = `$${values.push(cursor.time)}::timestamptz`;
    const idParam = `$${values.push(cursor.id)}::uuid`;
    where.push(`(r.started_at,r.id) < (${timeParam},${idParam})`);
  }
  const limitParam = `$${values.push(input.limit + 1)}::integer`;
  const rows = (await pool.query(`SELECT r.*,
      to_char(r.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
    FROM research_log r
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY r.started_at DESC,r.id DESC LIMIT ${limitParam}`, values)).rows;
  const hasMore = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return {
    items: page.map(row => {
      const { cursor_time: _cursorTime, ...record } = row;
      return camel(record);
    }),
    nextCursor: hasMore && last ? encodeHistoryCursor("runs", last.cursor_time, last.id) : null,
  };
}

const joinedVersions = `(
  SELECT 'content'::text AS joined_kind,v.* FROM future_of_work_content v
  UNION ALL SELECT 'programs'::text AS joined_kind,v.* FROM leading_programs v
  UNION ALL SELECT 'news'::text AS joined_kind,v.* FROM future_work_news v
)`;

export async function listEditorialDecisions(input: HistoryQuery) {
  const cursor = decodeHistoryCursor(input.cursor, "decisions");
  const values: unknown[] = [];
  const where: string[] = [];
  if (input.functionId) where.push(`v.function_id=$${values.push(input.functionId)}::uuid`);
  if (input.category !== "all") {
    const param = `$${values.push(input.category)}::text`;
    where.push(`CASE WHEN d.kind='content' THEN v.horizon::text ELSE d.kind END=${param}`);
  }
  if (cursor) {
    const timeParam = `$${values.push(cursor.time)}::timestamptz`;
    const idParam = `$${values.push(cursor.id)}::uuid`;
    where.push(`(d.created_at,d.id) < (${timeParam},${idParam})`);
  }
  const limitParam = `$${values.push(input.limit + 1)}::integer`;
  const rows = (await pool.query(`SELECT d.*,row_to_json(v) AS version_record,
      to_char(d.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
    FROM future_work_decisions d
    JOIN ${joinedVersions} v ON v.joined_kind=d.kind AND v.id=d.version_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY d.created_at DESC,d.id DESC LIMIT ${limitParam}`, values)).rows;
  const hasMore = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return {
    items: page.map(row => {
      const { version_record, cursor_time: _cursorTime, ...decision } = row;
      const { joined_kind: _joinedKind, ...versionRow } = version_record;
      return { ...camel(decision), kind: row.kind, version: version(versionRow) };
    }),
    nextCursor: hasMore && last ? encodeHistoryCursor("decisions", last.cursor_time, last.id) : null,
  };
}

export async function readVersionHistory(kind: Kind, id: string) {
  const row = (await pool.query(`SELECT * FROM ${tables[kind]} WHERE id=$1`, [id])).rows[0];
  if (!row) throw new FutureWorkError(404, "Version not found");
  const decisions = (await pool.query(
    "SELECT * FROM future_work_decisions WHERE kind=$1 AND version_id=$2 ORDER BY created_at ASC,id ASC",
    [kind, id],
  )).rows.map(camel);
  const previous = row.previous_version_id
    ? (await pool.query(`SELECT * FROM ${tables[kind]} WHERE id=$1`, [row.previous_version_id])).rows[0]
    : null;
  return {
    version: version(row),
    decisions,
    // The complete predecessor retains its sources, quotes, and run reference,
    // allowing staff to assess what evidence changed between versions.
    previousVersion: previous ? version(previous) : null,
  };
}