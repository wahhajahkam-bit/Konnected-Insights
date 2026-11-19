import { pool } from "@workspace/db";
import { horizons, validResearchEvidence, eligiblePublishedProgram } from "./futureWorkPolicy";

export const tables = { content: "future_of_work_content", programs: "leading_programs", news: "future_work_news" } as const;
export type Kind = keyof typeof tables;
const connect = () => pool.connect();
export type ResearchTransaction = Awaited<ReturnType<typeof connect>>;
export const camel = (row: Record<string, any>): Record<string, any> => ({
  ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), value])),
  ...(Array.isArray(row.results) && Array.isArray(row.plan) ? {
    outcomeCounts: Object.fromEntries(["published","unchanged","nothing_found","failed","skipped"].map(outcome=>[outcome,row.results.filter((r: any)=>r.outcome===outcome).length])),
  } : {}),
});
export function version(row: Record<string, any>, publicView = false) {
  const { data, ...rest } = camel(row);
  const result = { ...data, ...rest };
  if (!String(result.slot).includes(":programs:")) {
    delete result.programName; delete result.organization; delete result.description;
    delete result.classification; delete result.rationale;
  }
  if (String(result.slot).includes(":news:")) { delete result.horizon; delete result.lens; }
  if (publicView) {
    delete result.previousVersionId; delete result.approvedAt;
    delete result.runId; delete result.supportingQuotes; delete result.relevant;
    result.sources = (result.sources ?? []).map((s: Record<string, any>) => {
      const { excerpt, ...source } = s; return source;
    });
  }
  return result;
}
export class FutureWorkError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function refreshStale() {
  for (const [kind, table] of Object.entries(tables)) {
    await pool.query(`UPDATE ${table} v SET stale=true WHERE status='published' AND NOT stale
      AND (last_verified_at IS NULL OR last_verified_at < now() -
      (SELECT stale_after_days * interval '1 day' FROM future_work_schedules WHERE id=${kind === "content" ? "v.horizon::text" : "$1"}))`,
    kind === "content" ? [] : [kind]);
    // One durable task per approved version. Repeated public reads never create
    // duplicate work, and a pending candidate remains linked rather than retried.
    await pool.query(`INSERT INTO future_work_research_queue(kind,version_id,function_id,horizon,lens)
      SELECT $1,v.id,v.function_id,v.horizon,v.lens FROM ${table} v
      JOIN future_work_functions f ON f.id=v.function_id
      WHERE v.status='published' AND v.stale AND f.enabled
      ON CONFLICT(version_id) DO UPDATE SET status='queued',next_attempt_at=now(),updated_at=now()
      WHERE future_work_research_queue.status='resolved'`,[kind]);
    await pool.query(`UPDATE future_work_research_queue q SET status='resolved',updated_at=now()
      WHERE q.kind=$1 AND q.status<>'resolved' AND NOT EXISTS(
        SELECT 1 FROM ${table} v WHERE v.id=q.version_id AND v.status='published' AND v.stale)`,[kind]);
  }
}
export async function readPortal(staff = false) {
  await refreshStale();
  const functions = (await pool.query(`SELECT * FROM future_work_functions ${staff ? "" : "WHERE enabled"} ORDER BY sort_order,name`)).rows.map(camel);
  if (!staff) for (const fn of functions) delete fn.researchSources;
  const result: Record<string, any> = { functions, horizons };
  for (const [kind, table] of Object.entries(tables)) {
    const rows = (await pool.query(`SELECT v.* FROM ${table} v JOIN future_work_functions f ON f.id=v.function_id
      ${staff ? "" : "WHERE v.status='published' AND f.enabled"} ORDER BY ${kind === "news" ? "v.data->'sources'->0->>'publishedAt' DESC NULLS LAST," : ""} v.updated_at DESC LIMIT 1000`)).rows;
    result[kind] = rows.filter(row => staff || kind !== "programs" || eligiblePublishedProgram(row.data)).map(row => version(row,!staff));
  }
  const published = [...result.content, ...result.programs, ...result.news].filter(v => v.status === "published");
  const overdue = published.filter(v => v.stale).sort((a, b) => new Date(a.lastVerifiedAt ?? 0).getTime() - new Date(b.lastVerifiedAt ?? 0).getTime());
  const oldest = overdue[0] ?? [...published].sort((a,b) => new Date(a.lastVerifiedAt ?? 0).getTime() - new Date(b.lastVerifiedAt ?? 0).getTime())[0];
  const missing = functions.some(f => horizons.some(h => ["technology", "field"].some(l => !result.content.some((v: any) => v.status === "published" && v.functionId === f.id && v.horizon === h.year && v.lens === l))));
  const oldestFunction = functions.find(f => f.id === oldest?.functionId);
  const oldestSection = oldest ? `${oldestFunction?.name ?? "Research"} · ${oldest.horizon ?? "Weekly news"}${oldest.lens ? ` · ${oldest.lens} lens` : ""}` : null;
  result.freshness = {
    status: overdue.length ? "overdue" : missing ? "unrefreshed" : "current",
    oldestUpdatedAt: oldest?.lastVerifiedAt ?? null, overdueCount: overdue.length,
    label: overdue.length ? `Oldest overdue: ${oldestSection} · ${overdue.length} sections under review` : missing ? "Some sections await verified research" : `Published research is current${oldestSection ? ` · oldest: ${oldestSection}` : ""}`,
    href: oldestFunction ? `/future-of-work/${oldestFunction.slug}` : `/future-of-work#horizon-${oldest?.horizon ?? 2030}`, itemId: oldest?.id ?? null,
  };
  if (staff) {
    result.schedules = (await pool.query("SELECT * FROM future_work_schedules ORDER BY id")).rows.map(camel);
    result.runs = (await pool.query("SELECT * FROM research_log ORDER BY started_at DESC LIMIT 50")).rows.map(camel);
    const returnedVersionIds = [...result.content, ...result.programs, ...result.news].map((item: any) => item.id);
    // Keep the bounded recent activity feed, but never omit rejection reasons
    // for versions returned by this portal response.
    result.decisions = (await pool.query(`SELECT * FROM future_work_decisions
      WHERE id IN (SELECT id FROM future_work_decisions ORDER BY created_at DESC,id DESC LIMIT 200)
        OR (action='reject' AND version_id=ANY($1::uuid[]))
      ORDER BY created_at DESC,id DESC`, [returnedVersionIds])).rows.map(camel);
    result.queue = (await pool.query("SELECT * FROM future_work_research_queue ORDER BY created_at DESC LIMIT 300")).rows.map(camel);
  }
  return result;
}
export async function reviewVersion(kind: Kind, id: string, input: {
  revision: number; action: string; reason?: string; changes?: Record<string, any>;
}, actor: string, transaction?: ResearchTransaction) {
  const client = transaction ?? await pool.connect();
  const table = tables[kind];
  try {
    if (!transaction) await client.query("BEGIN");
    // Serialize slot transitions across every version, not just the selected row.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`future-work-review:${kind}`]);
    const row = (await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id])).rows[0];
    if (!row) throw new FutureWorkError(404, "Version not found");
    if (row.revision !== input.revision) throw new FutureWorkError(409, "Version changed; reload before reviewing");
    const latest = (await client.query(`SELECT id FROM ${table} WHERE slot=$1 AND status='published'`, [row.slot])).rows[0];
    let result;
    if (input.action === "edit") {
      const data = { ...row.data, ...input.changes };
      result = (await client.query(`INSERT INTO ${table}(function_id,horizon,lens,slot,data,previous_version_id,last_verified_at)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [row.function_id,row.horizon,row.lens,row.slot,data,row.id,row.last_verified_at])).rows[0];
      await client.query(`UPDATE ${table} SET revision=revision+1,updated_at=now(),
        status=CASE WHEN status IN ('pending_review','flagged') THEN 'superseded' ELSE status END WHERE id=$1`, [id]);
      await client.query("INSERT INTO future_work_decisions(kind,version_id,action,actor,reason) VALUES($1,$2,'created_by_edit',$3,$4)",
        [kind,result.id,actor,`Parent version ${row.id}. ${input.reason ?? ""}`]);
      await client.query("UPDATE future_work_research_queue SET candidate_version_id=$2,updated_at=now() WHERE candidate_version_id=$1 AND status='review_pending'",[id,result.id]);
    } else {
      const action = input.action;
      if (action === "approve" || action === "restore") {
        if (action === "restore" && !row.approved_at) throw new FutureWorkError(400, "Only previously approved versions may be restored");
        if (action === "approve" && !["pending_review","flagged"].includes(row.status)) throw new FutureWorkError(409, "Only pending or flagged versions can be approved");
        if (!Array.isArray(row.data.sources) || !row.data.sources.length || !row.data.sources.every(validResearchEvidence)) throw new FutureWorkError(400, "Fetched, dated, verified-publisher evidence with valid hashes is required");
        for (const source of row.data.sources) {
          if (source.verification) continue;
          const receipt = (await client.query(`SELECT id FROM future_work_evidence WHERE accepted AND run_id::text=$1
            AND publisher=$2 AND evidence->>'url'=$3 AND evidence->>'contentHash'=$4
            AND evidence->>'fetchedAt'=$5 AND evidence->>'excerpt'=$6`,
          [row.data.runId ?? "",source.publisher,source.url,source.contentHash,source.fetchedAt,source.excerpt])).rows[0];
          if (!receipt) throw new FutureWorkError(400,"Independent accepted fetch receipt required for legacy evidence");
        }
        if (kind === "programs" && !eligiblePublishedProgram(row.data)) throw new FutureWorkError(400, "Only evidence-classified, relevant future-focused programs may be published");
        if (action === "approve" && (latest?.id ?? null) !== (row.previous_version_id ?? null)) {
          // Editing an unapproved proposal keeps a lineage chain. Resolve its approved ancestor.
          const ancestors = await client.query(`WITH RECURSIVE chain AS (
            SELECT id,previous_version_id,approved_at FROM ${table} WHERE id=$1
            UNION ALL SELECT v.id,v.previous_version_id,v.approved_at FROM ${table} v JOIN chain c ON v.id=c.previous_version_id
          ) SELECT id FROM chain WHERE approved_at IS NOT NULL LIMIT 1`, [row.previous_version_id]);
          if ((ancestors.rows[0]?.id ?? null) !== (latest?.id ?? null)) throw new FutureWorkError(409, "Published baseline changed; edit/research against the current version");
        }
        await client.query(`UPDATE ${table} SET status=CASE WHEN status='published' THEN 'unpublished' ELSE status END,
          revision=revision+1 WHERE slot=$1 AND id<>$2`, [row.slot,id]);
        result = (await client.query(`UPDATE ${table} SET status='published',approved_at=coalesce(approved_at,now()),published_at=now(),updated_at=now(),revision=revision+1 WHERE id=$1 RETURNING *`, [id])).rows[0];
      } else {
        if (action === "unpublish" && row.status !== "published") throw new FutureWorkError(409, "Version is not published");
        if (action === "reject" && !["pending_review","flagged"].includes(row.status)) throw new FutureWorkError(409, "Version is not awaiting review");
        result = (await client.query(`UPDATE ${table} SET status=$2,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *`, [id,action === "reject" ? "rejected" : "unpublished"])).rows[0];
      }
      if (input.action === "reject") await client.query(`UPDATE future_work_research_queue SET status='retry_wait',next_attempt_at=now()+interval '1 day',updated_at=now()
        WHERE candidate_version_id=$1 AND status='review_pending'`,[id]);
      if (["approve","restore","unpublish"].includes(input.action)) {
        await client.query(`UPDATE future_work_research_queue SET status='resolved',updated_at=now()
          WHERE kind=$1 AND function_id=$2 AND horizon=$3 AND lens=$4 AND
          ($1='content' OR version_id=$5 OR candidate_version_id=$5)`,[kind,row.function_id,row.horizon,row.lens,id]);
      }
    }
    await client.query("INSERT INTO future_work_decisions(kind,version_id,action,actor,reason) VALUES($1,$2,$3,$4,$5)", [kind,id,input.action,actor,input.reason ?? ""]);
    if (!transaction) await client.query("COMMIT");
    return version(result);
  } catch (error) { if (!transaction) await client.query("ROLLBACK"); throw error; } finally { if (!transaction) client.release(); }
}