import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { requireEditorialStaff } from "../middlewares/requireEditorialStaff";
import { camel, FutureWorkError, readPortal, reviewVersion } from "../lib/futureWorkStore";
import { claimResearchRun, claimSelectedResearch, researchInput, executeResearchRun } from "../lib/futureWorkResearch";
import { logger } from "../lib/logger";
import { futureWorkReviewInput as reviewInput, researchSourcesSchema } from "../lib/futureWorkPolicy";
import { futureWorkPresentation } from "../lib/futureWorkPresentation";
import { preflightResearchSource } from "../lib/futureWorkPreflight";
import {
  historyQuerySchema,
  listEditorialDecisions,
  listResearchRuns,
  readVersionHistory,
} from "../lib/futureWorkHistory";

const router: IRouter = Router();
const prefix = "/editorial/future-work";
const uuid = z.string().uuid();
const revision = z.number().int().positive();
const functionFields = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  name: z.string().trim().min(1).max(100), description: z.string().trim().max(1000).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(), enabled: z.boolean().optional(),
  presentation: futureWorkPresentation.optional(),
  researchSources: researchSourcesSchema.nullable().optional(),
}).strict();
function launchResearch(runId: string) {
  void executeResearchRun(runId).catch(async error=>{
    logger.error({err:error,runId},"Future work background run failed; lease recovery required");
    // Includes failures before the executor's normal guarded work (e.g. acquiring a connection).
    // If the DB is unavailable, the previously persisted five-minute lease still expires.
    try {
      await pool.query("UPDATE research_log SET lease_until=now(),errors=errors || $2::jsonb WHERE id=$1 AND status='running'",
        [runId,JSON.stringify([error instanceof Error ? error.message.slice(0,1200) : "Background worker startup failed"])]);
    } catch(persistenceError) {
      logger.error({err:persistenceError,runId},"Unable to persist worker failure; existing lease will expire");
    }
  });
}
function sendError(error: unknown, res: import("express").Response) {
  if (error instanceof z.ZodError) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: error.issues.map(v=>v.message).join("; ") } });
  if (error instanceof FutureWorkError) return res.status(error.status).json({ error: { code: error.status === 409 ? "CONFLICT" : "INVALID_REQUEST", message: error.message } });
  if ((error as { code?: string })?.code === "23505") return res.status(409).json({ error: { code: "CONFLICT", message: "This slug or active research run already exists." } });
  logger.error({ err: error }, "Future work request failed");
  return res.status(500).json({ error: { code: "FUTURE_WORK_ERROR", message: "Future work operation failed. Please retry." } });
}
router.get("/future-work", async (_req,res) => {
  try { res.json({ data: await readPortal() }); } catch(error) { sendError(error,res); }
});
router.get("/future-work/freshness", async (_req,res) => {
  try { res.json({ data: (await readPortal()).freshness }); } catch(error) { sendError(error,res); }
});
router.get("/future-work/functions/:slug", async (req,res) => {
  try {
    const portal = await readPortal();
    const fn = portal.functions.find((f: any) => f.slug === req.params.slug);
    if (!fn) throw new FutureWorkError(404,"Function not found");
    const content = portal.content.filter((v: any) => v.functionId === fn.id);
    const skills = [...new Set(content.filter((v: any) => v.horizon === 2030).flatMap((v: any) => v.skills ?? []))];
    res.json({ data: { function: fn, content, programs: portal.programs.filter((v: any)=>v.functionId===fn.id), news: portal.news.filter((v: any)=>v.functionId===fn.id), skills } });
  } catch(error) { sendError(error,res); }
});
router.use(prefix,requireEditorialStaff);
router.post(`${prefix}/functions/:id/source-preflight`, async (req,res) => {
  try {
    const id = uuid.parse(req.params.id);
    const input = z.object({ revision, sourceIndex: z.number().int().min(0).max(9) }).strict().parse(req.body);
    const row = (await pool.query("SELECT revision,research_sources FROM future_work_functions WHERE id=$1", [id])).rows[0];
    if (!row) throw new FutureWorkError(404,"Function not found");
    if (row.revision !== input.revision) throw new FutureWorkError(409,"Saved sources changed; reload");
    if (!row.research_sources) throw new FutureWorkError(400,"No saved research sources");
    const url = researchSourcesSchema.parse(row.research_sources).urls[input.sourceIndex];
    if (!url) throw new FutureWorkError(400,"Saved source not found");
    const windows = (await pool.query("SELECT id,source_window_months FROM future_work_schedules")).rows
      .map(row => ({ id: row.id, sourceWindowMonths: row.source_window_months }));
    res.setHeader("Cache-Control","no-store");
    res.json({ data: await preflightResearchSource(url, windows) });
  } catch(error) { sendError(error,res); }
});
router.get(prefix, async (_req,res) => {
  try { res.json({ data: await readPortal(true) }); } catch(error) { sendError(error,res); }
});
router.get(`${prefix}/history/runs`, async (req,res) => {
  try { res.json({ data: await listResearchRuns(historyQuerySchema.parse(req.query)) }); } catch(error) { sendError(error,res); }
});
router.get(`${prefix}/history/decisions`, async (req,res) => {
  try { res.json({ data: await listEditorialDecisions(historyQuerySchema.parse(req.query)) }); } catch(error) { sendError(error,res); }
});
router.get(`${prefix}/history/versions/:kind/:id`, async (req,res) => {
  try {
    const kind = z.enum(["content","programs","news"]).parse(req.params.kind);
    res.json({ data: await readVersionHistory(kind,uuid.parse(req.params.id)) });
  } catch(error) { sendError(error,res); }
});
router.post(`${prefix}/functions`, async (req,res) => {
  try {
    const input = functionFields.parse(req.body);
    const row = (await pool.query(`INSERT INTO future_work_functions(slug,name,description,sort_order,enabled,presentation,research_sources)
      SELECT $1,$2,$3,$4,$5,$6::jsonb,$7::jsonb WHERE (SELECT count(*) FROM future_work_functions)<50 RETURNING *`,
    [input.slug,input.name,input.description??"",input.sortOrder??0,input.enabled??true,JSON.stringify(input.presentation??{}),
      input.researchSources == null ? null : JSON.stringify(input.researchSources)])).rows[0];
    if (!row) throw new FutureWorkError(400,"Limit of 50 configurable functions");
    res.status(201).json({ data: camel(row) });
  } catch(error) { sendError(error,res); }
});
router.patch(`${prefix}/functions/:id`, async (req,res) => {
  try {
    const id = uuid.parse(req.params.id);
    const input = functionFields.partial().extend({ revision }).parse(req.body);
    const row = (await pool.query(`UPDATE future_work_functions SET slug=coalesce($3,slug),name=coalesce($4,name),
      description=coalesce($5,description),sort_order=coalesce($6,sort_order),enabled=coalesce($7,enabled),
      presentation=coalesce($8::jsonb,presentation),
      research_sources=CASE WHEN $9::boolean THEN $10::jsonb ELSE research_sources END,revision=revision+1
      WHERE id=$1 AND revision=$2 RETURNING *`, [id,input.revision,input.slug,input.name,input.description,input.sortOrder,input.enabled,
      input.presentation === undefined ? null : JSON.stringify(input.presentation),
      Object.prototype.hasOwnProperty.call(input,"researchSources"),
      input.researchSources == null ? null : JSON.stringify(input.researchSources)])).rows[0];
    if (!row) throw new FutureWorkError(409,"Function changed or no longer exists; reload");
    res.json({ data: camel(row) });
  } catch(error) { sendError(error,res); }
});
router.post(`${prefix}/review/:kind/:id`, async (req,res) => {
  try {
    const kind = z.enum(["content","programs","news"]).parse(req.params.kind);
    res.json({ data: await reviewVersion(kind,uuid.parse(req.params.id),reviewInput.parse(req.body),res.locals.staffUserId) });
  } catch(error) { sendError(error,res); }
});
router.patch(`${prefix}/schedules/:id`, async (req,res) => {
  try {
    const id = z.enum(["2030","2050","2100","programs","news"]).parse(req.params.id);
    const input = z.object({
      revision, enabled: z.boolean().optional(), sourceWindowMonths: z.number().int().min(1).max(120).optional(),
      staleAfterDays: z.number().int().min(1).max(3650).optional(), verificationOnlyOptIn: z.boolean().optional(),
    }).strict().parse(req.body);
    const row = (await pool.query(`UPDATE future_work_schedules SET enabled=coalesce($3,enabled),source_window_months=coalesce($4,source_window_months),
      stale_after_days=coalesce($5,stale_after_days),verification_only_opt_in=coalesce($6,verification_only_opt_in),revision=revision+1
      WHERE id=$1 AND revision=$2 RETURNING *`, [id,input.revision,input.enabled,input.sourceWindowMonths,input.staleAfterDays,input.verificationOnlyOptIn])).rows[0];
    if (!row) throw new FutureWorkError(409,"Schedule changed; reload");
    res.json({ data: camel(row) });
  } catch(error) { sendError(error,res); }
});
router.post(`${prefix}/research`, async (req,res) => {
  try {
    const run = await claimSelectedResearch(researchInput.parse(req.body),res.locals.staffUserId);
    launchResearch(run.id);
    res.status(202).json({ data: run });
  } catch(error) { sendError(error,res); }
});
router.post(`${prefix}/runs`, async (req,res) => {
  try {
    const input = z.object({ scheduleId: z.enum(["2030","2050","2100","programs","news"]), maxCombinations: z.number().int().min(1).max(4).default(1) }).strict().parse(req.body);
    const run = await claimResearchRun(input.scheduleId,input.maxCombinations,res.locals.staffUserId);
    launchResearch(run.id);
    res.status(202).json({ data: run });
  } catch(error) { sendError(error,res); }
});
export default router;