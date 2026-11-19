import { Router, type IRouter, type RequestHandler } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";
import { requireEditorialAdmin } from "../middlewares/requireEditorialStaff";
import { manualSession, monitoringFilters } from "../lib/agentMonitoringPolicy";
import { adaptHistory, camelRow, filterSql, inventory, operationsFor, presentRun, historyCoverage, sourceRunDetails, presentOperation } from "../lib/agentMonitoringStore";

const router: IRouter = Router();
const prefix = "/editorial/agents";
router.use(prefix, requireEditorialAdmin);
const wrap = (fn: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await fn(req, res, next); }
  catch { res.status(503).json({ error: { code: "MONITORING_UNAVAILABLE", message: "Agent monitoring is unavailable. Please retry." } }); }
};
let lastAdapt = 0;
router.use(prefix, wrap(async (_req, _res, next) => {
  if (Date.now() - lastAdapt > 60000) { await adaptHistory(); lastAdapt = Date.now(); }
  next();
}));
const coverage = async () => (await pool.query("SELECT min(created_at) AS since FROM agent_runs WHERE provenance='automatic'")).rows[0].since;
router.get(prefix, wrap(async (_req, res) => {
  const agents = await Promise.all(inventory.map(async agent => {
    const latestActivity = (await pool.query("SELECT max(started_at) AS latest FROM agent_runs WHERE agent_id=$1 AND deleted_at IS NULL", [agent.id])).rows[0].latest;
    let enabled: boolean | null = null, schedule: string | null = null;
    const table = agent.id === "gmail-automation" ? "editorial_automation_rules" : agent.id === "newsletter-ingestion" ? "newsletter_sources" : agent.id === "future-work-research" ? "future_work_schedules" : null;
    if (table && (await pool.query("SELECT to_regclass($1) AS name", [table])).rows[0].name) {
      enabled = (await pool.query(`SELECT coalesce(bool_or(enabled),false) AS enabled FROM ${table}`)).rows[0].enabled;
      schedule = agent.id === "newsletter-ingestion" ? "Daily 02:00 UTC (enabled sources)" : "Per configured schedule";
    }
    return { ...agent, latestActivity, enabled, schedule };
  }));
  res.json({ data: { agents, trackingSince: await coverage(), historyCoverage: await historyCoverage(), replitLiveConnected: false } });
}));
router.get(`${prefix}/runs`, wrap(async (req, res) => {
  const parsed = monitoringFilters.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid monitoring filters" } }); return; }
  const f = parsed.data, { where, values } = filterSql(f);
  const result = await pool.query(`SELECT * FROM agent_runs WHERE ${where} ORDER BY started_at DESC,id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, f.pageSize, (f.page - 1) * f.pageSize]);
  const items = await Promise.all(result.rows.map(async row => presentRun(row, await operationsFor([row.id]))));
  const total = Number((await pool.query(`SELECT count(*) FROM agent_runs WHERE ${where}`, values)).rows[0].count);
  res.json({ data: { items, total, page: f.page, pageSize: f.pageSize } });
}));
router.get(`${prefix}/summary`, wrap(async (req, res) => {
  const parsed = monitoringFilters.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid monitoring filters" } }); return; }
  const { where, values } = filterSql(parsed.data);
  const counts = (await pool.query(`SELECT count(*)::int AS runs,
    count(*) FILTER(WHERE status='succeeded')::int AS succeeded,count(*) FILTER(WHERE status='failed')::int AS failed,
    count(*) FILTER(WHERE status='partial')::int AS partial,
    count(*) FILTER(WHERE status='interrupted' OR status='running' AND heartbeat_at<now()-interval '30 minutes')::int AS interrupted,
    count(*) FILTER(WHERE status='running' AND heartbeat_at>=now()-interval '30 minutes')::int AS running,
    coalesce(sum(coalesce(duration_ms,extract(epoch FROM (finished_at-started_at))*1000)),0)::float8 AS elapsed_ms
    FROM agent_runs WHERE ${where}`, values)).rows[0];
  const costRows = (await pool.query(`WITH RECURSIVE roots AS (SELECT * FROM agent_runs WHERE ${where}),
    family AS (SELECT id AS root,id FROM roots UNION ALL SELECT f.root,r.id FROM agent_runs r JOIN family f ON r.parent_run_id=f.id),
    usage AS (SELECT f.root,count(o.id) AS n,count(o.cost_amount) AS priced,bool_or(o.partial) AS partial
      FROM family f LEFT JOIN agent_operations o ON o.run_id=f.id GROUP BY f.root)
    SELECT count(*) FILTER(WHERE CASE WHEN r.provenance='manual' THEN r.cost_amount IS NULL ELSE u.priced=0 END)::int AS unknown,
      count(*) FILTER(WHERE r.provenance<>'manual' AND u.priced>0 AND (u.priced<u.n OR u.partial))::int AS partial
    FROM roots r JOIN usage u ON u.root=r.id`, values)).rows[0];
  const costs = (await pool.query(`WITH RECURSIVE roots AS (SELECT * FROM agent_runs WHERE ${where}),
    family AS (SELECT id AS root,id FROM roots UNION ALL SELECT f.root,r.id FROM agent_runs r JOIN family f ON r.parent_run_id=f.id),
    amounts AS (
      SELECT o.currency,o.cost_amount,'estimated'::text AS provenance FROM family f JOIN agent_operations o ON o.run_id=f.id WHERE o.cost_amount IS NOT NULL
      UNION ALL SELECT currency,cost_amount,'manual' FROM roots WHERE provenance='manual' AND cost_amount IS NOT NULL)
    SELECT currency,sum(cost_amount)::float8 AS amount,provenance FROM amounts GROUP BY currency,provenance`, values)).rows;
  const byAgent = (await pool.query(`SELECT agent_id,count(*)::int AS runs,count(*) FILTER(WHERE status='succeeded')::int AS succeeded,
    count(*) FILTER(WHERE status='failed')::int AS failed,coalesce(sum(coalesce(duration_ms,extract(epoch FROM (finished_at-started_at))*1000)),0)::float8 AS elapsed_ms
    FROM agent_runs WHERE ${where} GROUP BY agent_id`, values)).rows.map(camelRow);
  res.json({ data: { ...camelRow(counts), unknownCostRuns: costRows.unknown, partialCostRuns: costRows.partial, costs, byAgent, trackingSince: await coverage(), historyCoverage: await historyCoverage() } });
}));
router.get(`${prefix}/runs/:id`, wrap(async (req, res) => {
  if (!z.uuid().safeParse(req.params.id).success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid run ID" } }); return; }
  const row = (await pool.query("SELECT * FROM agent_runs WHERE id=$1 AND deleted_at IS NULL", [req.params.id])).rows[0];
  if (!row) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Run not found" } }); return; }
  const operations = await operationsFor([row.id]);
  const children = (await pool.query("SELECT * FROM agent_runs WHERE parent_run_id=$1 ORDER BY started_at,id", [row.id])).rows;
  const audit = (await pool.query("SELECT action,actor,at FROM agent_manual_audit WHERE run_id=$1 ORDER BY at,id", [row.id])).rows;
  res.json({ data: { run: presentRun(row, operations), source: await sourceRunDetails(row), children: await Promise.all(children.map(async child => presentRun(child, await operationsFor([child.id])))),
    operations: operations.map(presentOperation), audit } });
}));
const saveManual: RequestHandler = wrap(async (req, res) => {
  const parsed = manualSession.safeParse(req.body);
  const id = req.params.id;
  if (!parsed.success || id && !z.uuid().safeParse(id).success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Check session label, dates, duration and cost/currency" } }); return; }
  const v = parsed.data, actor = String(res.locals.staffUserId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const values = [v.label, v.startedAt, v.finishedAt ?? null, v.durationMs ?? null, v.costAmount ?? null, v.currency ?? null, v.reference ?? null, v.notes ?? null, v.status, actor];
    const row = id ? (await client.query(`UPDATE agent_runs SET label=$1,started_at=$2,finished_at=$3,duration_ms=$4,cost_amount=$5,currency=$6,reference=$7,notes=$8,status=$9,updated_by=$10,updated_at=now()
      WHERE id=$11 AND provenance='manual' AND deleted_at IS NULL RETURNING *`, [...values, id])).rows[0]
      : (await client.query(`INSERT INTO agent_runs(label,started_at,finished_at,duration_ms,cost_amount,currency,reference,notes,status,entered_by,updated_by,agent_id,category,provenance)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,'replit-development','replit','manual') RETURNING *`, values)).rows[0];
    if (!row) { await client.query("ROLLBACK"); res.status(404).json({ error: { code: "NOT_FOUND", message: "Manual session not found" } }); return; }
    await client.query("INSERT INTO agent_manual_audit(run_id,action,actor) VALUES($1,$2,$3)", [row.id, id ? "updated" : "created", actor]);
    await client.query("COMMIT");
    res.status(id ? 200 : 201).json({ data: presentRun(row, []) });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});
router.post(`${prefix}/manual`, saveManual);
router.patch(`${prefix}/manual/:id`, saveManual);
router.delete(`${prefix}/manual/:id`, wrap(async (req, res) => {
  if (!z.uuid().safeParse(req.params.id).success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid run ID" } }); return; }
  const result = await pool.query(`WITH deleted AS (UPDATE agent_runs SET deleted_at=now(),updated_at=now(),updated_by=$2
    WHERE id=$1 AND provenance='manual' AND deleted_at IS NULL RETURNING id)
    INSERT INTO agent_manual_audit(run_id,action,actor) SELECT id,'deleted',$2 FROM deleted RETURNING run_id`, [req.params.id, String(res.locals.staffUserId)]);
  if (!result.rowCount) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Manual session not found" } }); return; }
  res.json({ data: { id: req.params.id } });
}));
export default router;