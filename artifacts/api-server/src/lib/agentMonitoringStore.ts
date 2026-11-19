import { pool } from "@workspace/db";
import { effectiveStatus, monitoringFilters, agentIds } from "./agentMonitoringPolicy";
import { z } from "zod/v4";

export type Filters = z.infer<typeof monitoringFilters>;
export const camelRow = (row: Record<string, any>): Record<string, any> => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
export function presentOperation(row: Record<string, any>): Record<string, any> & { elapsedMs: number | null } {
  const result = camelRow(row);
  for (const key of ["inputTokens", "outputTokens", "cachedTokens", "toolCalls", "inputTextTokens", "inputImageTokens", "outputTextTokens", "outputImageTokens", "costAmount"]) {
    result[key] = result[key] === null || result[key] === undefined ? null : Number(result[key]);
  }
  return { ...result, elapsedMs: row.provider_call_ms ?? (row.finished_at && row.started_at ? new Date(row.finished_at).getTime() - new Date(row.started_at).getTime() : null) };
}
const statusSql = "CASE WHEN status='running' AND heartbeat_at < now()-interval '30 minutes' THEN 'interrupted' ELSE status END";
export function filterSql(f: Filters) {
  const values: unknown[] = [];
  const clauses = ["deleted_at IS NULL", "parent_run_id IS NULL"];
  for (const [column, value, op] of [
    ["category", f.category, "="], ["agent_id", f.agentId, "="], [statusSql, f.status, "="],
    ["started_at", f.from, ">="], ["started_at", f.to, "<"],
  ] as const) if (value !== undefined) { values.push(value); clauses.push(`${column} ${op} $${values.length}`); }
  return { where: clauses.join(" AND "), values };
}
export async function operationsFor(ids: string[]) {
  if (!ids.length) return [];
  return (await pool.query(`WITH RECURSIVE family AS (
    SELECT id FROM agent_runs WHERE id=ANY($1::uuid[])
    UNION ALL SELECT r.id FROM agent_runs r JOIN family f ON r.parent_run_id=f.id
  ) SELECT o.* FROM agent_operations o JOIN family f ON o.run_id=f.id ORDER BY o.created_at,o.id`, [ids])).rows;
}
export function costInfo(row: Record<string, any>, operations: Record<string, any>[]) {
  if (row.provenance === "manual") return { costStatus: row.cost_amount === null ? "unknown" : "priced", costs: row.cost_amount === null ? [] : [{ currency: row.currency, amount: Number(row.cost_amount), provenance: "manual" }] };
  const priced = operations.filter(o => o.cost_amount !== null);
  const groups = new Map<string, number>();
  for (const o of priced) groups.set(o.currency, (groups.get(o.currency) ?? 0) + Number(o.cost_amount));
  return {
    costStatus: !priced.length ? "unknown" : priced.length < operations.length || operations.some(o => o.partial) ? "partial" : "priced",
    costs: [...groups].map(([currency, amount]) => ({ currency, amount, provenance: "estimated" })),
  };
}
export function presentRun(row: Record<string, any>, operations: Record<string, any>[]) {
  const { heartbeatAt: _, deletedAt: __, durationMs, ...visible } = camelRow(row);
  const status = effectiveStatus(row as { status: string; heartbeat_at: Date });
  const elapsedMs = row.duration_ms !== null ? Number(row.duration_ms) : row.finished_at ? Math.max(0, new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()) : status === "running" ? Math.max(0, Date.now() - new Date(row.started_at).getTime()) : null;
  return { ...visible, costAmount: row.cost_amount === null ? null : Number(row.cost_amount), status, elapsedMs, ...costInfo(row, operations) };
}
// Incremental idempotent adaptation: authoritative source records only; never copies error bodies or prompts.
export async function adaptHistory() {
  const sources = [
    ["editorial_automation_runs", "gmail-automation", "finished_at"],
    ["newsletter_source_runs", "newsletter-ingestion", "completed_at"],
    ["research_log", "future-work-research", "finished_at"],
  ];
  for (const [table, agent, finish] of sources) {
    if (!(await pool.query("SELECT to_regclass($1) AS name", [table])).rows[0].name) continue;
    await pool.query(`INSERT INTO agent_runs(agent_id,category,label,source_id,status,started_at,finished_at,heartbeat_at,provenance,outcome)
      SELECT $1,'website',$1,s.id::text,
        CASE s.status::text WHEN 'completed' THEN 'succeeded' WHEN 'succeeded' THEN 'succeeded' WHEN 'partial' THEN 'partial' WHEN 'running' THEN 'running' ELSE 'failed' END,
        s.started_at,s.${finish},coalesce(s.${finish},s.started_at),'historical','Historical source record'
      FROM ${table} s WHERE NOT EXISTS(SELECT 1 FROM agent_runs a WHERE a.agent_id=$1 AND a.source_id=s.id::text)
      ORDER BY s.started_at DESC LIMIT 500 ON CONFLICT(agent_id,source_id) DO NOTHING`, [agent]);
    // Only refresh historical records; never overwrite instrumented data.
    await pool.query(`UPDATE agent_runs a SET finished_at=s.${finish},
      status=CASE s.status::text WHEN 'completed' THEN 'succeeded' WHEN 'succeeded' THEN 'succeeded' WHEN 'partial' THEN 'partial' WHEN 'running' THEN 'running' ELSE 'failed' END,
      heartbeat_at=coalesce(s.${finish},s.started_at)
      FROM ${table} s WHERE a.agent_id=$1 AND a.source_id=s.id::text AND a.provenance='historical' AND a.status='running'`, [agent]);
  }
  if ((await pool.query("SELECT to_regclass('research_log') AS name")).rows[0].name) {
    const rows = (await pool.query(`SELECT a.id,r.usage FROM agent_runs a JOIN research_log r ON r.id::text=a.source_id
      WHERE a.agent_id='future-work-research' AND a.provenance='historical'
      AND NOT EXISTS(SELECT 1 FROM agent_operations o WHERE o.run_id=a.id) ORDER BY a.started_at DESC LIMIT 500`)).rows;
    for (const row of rows) {
      for (const [index, u] of (Array.isArray(row.usage) ? row.usage : []).entries()) {
        if (!["search", "summary", "support_review"].includes(u?.stage)) continue;
        const num = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
        const input = num(u.input_tokens ?? u.prompt_tokens), output = num(u.output_tokens ?? u.completion_tokens);
        if (input === null && output === null) continue;
        await pool.query(`INSERT INTO agent_operations(run_id,key,input_tokens,output_tokens,cached_tokens)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT(run_id,key) DO NOTHING`,
        [row.id, `historical-${index}`, input, output, num(u.input_tokens_details?.cached_tokens ?? u.prompt_tokens_details?.cached_tokens)]);
      }
    }
  }
}
export const inventory = agentIds.map((id, i) => ({
  id, name: ["Editorial drafts", "Image generation", "Gmail automation", "Newsletter ingestion", "Future of Work research"][i],
  purpose: ["Generate evidence-based editorial drafts", "Generate representative editorial artwork", "Import matching Gmail messages", "Create newsletter drafts from configured sources", "Research and verify future-of-work evidence"][i],
}));

export async function historyCoverage() {
  const sources = [["editorial_automation_runs", "gmail-automation"], ["newsletter_source_runs", "newsletter-ingestion"], ["research_log", "future-work-research"]];
  let remainingRuns = 0;
  for (const [table, agent] of sources) {
    if (!(await pool.query("SELECT to_regclass($1) AS name", [table])).rows[0].name) continue;
    remainingRuns += Number((await pool.query(`SELECT count(*) FROM ${table} s WHERE NOT EXISTS(
      SELECT 1 FROM agent_runs a WHERE a.agent_id=$1 AND a.source_id=s.id::text)`, [agent])).rows[0].count);
  }
  return { complete: remainingRuns === 0, remainingRuns, message: remainingRuns ? "Historical import in progress. Summaries currently cover imported records only." : "Available source history imported. Older generation activity was not recorded." };
}

/** Only allowlisted counters and internal CMS destinations leave source records. */
export async function sourceRunDetails(row: Record<string, any>) {
  const outputs: Array<{ label: string; path: string }> = [];
  const counts: Record<string, number> = {};
  const spec = row.agent_id === "gmail-automation"
    ? { table: "editorial_automation_runs", fields: ["matched", "attempted", "created", "skipped", "failed"] }
    : row.agent_id === "newsletter-ingestion"
      ? { table: "newsletter_source_runs", fields: ["fetched", "created", "skipped", "failed"] }
      : row.agent_id === "future-work-research"
        ? { table: "research_log", fields: ["processed", "sources_found", "sources_accepted", "sources_rejected"] } : null;
  if (!spec || !row.source_id || !/^[a-f0-9-]{36}$/.test(row.source_id)) return { counts, outputs };
  if (!(await pool.query("SELECT to_regclass($1) AS name", [spec.table])).rows[0].name) return { counts, outputs };
  // Source records may be removed independently of retained monitoring history.
  const source = (await pool.query(`SELECT * FROM ${spec.table} WHERE id=$1`, [row.source_id])).rows[0];
  if (!source) return { counts, outputs };
  for (const key of spec.fields) if (Number.isSafeInteger(source[key]) && source[key] >= 0) counts[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = source[key];
  if (row.agent_id === "future-work-research") outputs.push({ label: "Research history", path: "/admin/research" });
  else if (row.agent_id === "gmail-automation") outputs.push({ label: "Automation rules and history", path: "/admin/automation" });
  else if (Array.isArray(source.drafts) && (await pool.query("SELECT to_regclass('editorial_items') AS name")).rows[0].name) {
    const ids = source.drafts.map((d: any) => d?.id).filter((id: unknown): id is string => typeof id === "string" && /^[a-f0-9-]{36}$/.test(id)).slice(0, 100);
    const items = ids.length ? (await pool.query("SELECT id FROM editorial_items WHERE id=ANY($1::uuid[]) AND collection='newsletters'", [ids])).rows : [];
    for (const item of items) outputs.push({ label: "Newsletter draft", path: `/admin?newsletterId=${item.id}` });
  }
  return { counts, outputs };
}