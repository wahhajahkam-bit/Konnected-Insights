import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db, editorialAutomationRulesTable as rules, editorialAutomationRunsTable as runs } from "@workspace/db";
import { requireEditorialAdmin } from "../middlewares/requireEditorialStaff";
import { automationMailbox, AutomationServiceError } from "../lib/editorialAutomationGmail";
import { automationRuleInput, automationRulePatch, nextAutomationRun } from "../lib/editorialAutomationPolicy";
import { automationRuleResponse, beginAutomationRun, listAutomationRuns } from "../lib/editorialAutomation";

const router: IRouter = Router();
const prefix = "/editorial/automation";
router.use(prefix, requireEditorialAdmin);
const uuid = z.string().uuid();
const inactiveLease = sql`(${rules.leaseUntil} IS NULL OR ${rules.leaseUntil} < now())`;

router.get(`${prefix}/connection`, async (_req, res) => {
  try {
    return res.json({ data: { connected: true, email: await automationMailbox() } });
  } catch (error) {
    return res.json({ data: { connected: false, error: error instanceof AutomationServiceError ? error.message : "Unable to check Gmail connection." } });
  }
});

router.get(`${prefix}/rules`, async (_req, res) => {
  const rows = await db.select().from(rules).orderBy(desc(rules.createdAt));
  return res.json({ data: rows.map(automationRuleResponse) });
});

router.post(`${prefix}/rules`, async (req, res) => {
  const parsed = automationRuleInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Check the automation rule fields.", details: parsed.error.issues } });
  const { confirmAutomaticPublishing, ...input } = parsed.data;
  if (input.publishMode === "automatic" && !confirmAutomaticPublishing) {
    return res.status(400).json({ error: { code: "PUBLISH_CONFIRMATION_REQUIRED", message: "Explicitly confirm automatic publishing before enabling it." } });
  }
  try {
    const mailboxEmail = await automationMailbox();
    const [count] = await db.select({ value: sql<number>`count(*)::int` }).from(rules);
    if (count.value >= 50) return res.status(409).json({ error: { code: "RULE_LIMIT", message: "Limit of 50 automation rules reached." } });
    const [rule] = await db.insert(rules).values({
      ...input, mailboxEmail, createdByUserId: res.locals.staffUserId,
      nextRunAt: nextAutomationRun(input.scheduleUtc),
    }).returning();
    return res.status(201).json({ data: automationRuleResponse(rule) });
  } catch (error) {
    return res.status(502).json({ error: { code: "AUTOMATION_SETUP_FAILED", message: error instanceof AutomationServiceError ? error.message : "Automation rule could not be saved." } });
  }
});

router.patch(`${prefix}/rules/:id`, async (req, res) => {
  const id = uuid.safeParse(req.params.id);
  const parsed = automationRulePatch.safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Check the rule ID and fields." } });
  const { confirmAutomaticPublishing, ...input } = parsed.data;
  if (input.publishMode === "automatic" && !confirmAutomaticPublishing) {
    return res.status(400).json({ error: { code: "PUBLISH_CONFIRMATION_REQUIRED", message: "Explicitly confirm automatic publishing before enabling it." } });
  }
  const [existing] = await db.select().from(rules).where(eq(rules.id, id.data));
  if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Automation rule not found." } });
  try {
    // Pausing does not require Gmail to be reachable.
    const pauseOnly = Object.keys(input).length === 1 && input.enabled === false;
    const mailboxEmail = pauseOnly ? existing.mailboxEmail : await automationMailbox();
    const rule = await db.transaction(async tx => {
      const [updated] = await tx.update(rules).set({
        ...input, mailboxEmail, createdByUserId: res.locals.staffUserId, updatedAt: new Date(),
        ...(input.scheduleUtc ? { nextRunAt: nextAutomationRun(input.scheduleUtc) } : {}),
        ...(pauseOnly ? { leaseToken: null, leaseUntil: null } : {}),
      }).where(and(eq(rules.id, id.data), ...(pauseOnly ? [] : [inactiveLease]))).returning();
      if (updated && pauseOnly) await tx.update(runs).set({
        status: "failed", finishedAt: new Date(), error: "Import stopped because an administrator paused this rule.",
      }).where(and(eq(runs.ruleId, id.data), eq(runs.status, "running")));
      return updated;
    });
    if (!rule) return res.status(409).json({ error: { code: "AUTOMATION_BUSY", message: "Wait for the running import to finish before changing this rule." } });
    return res.json({ data: automationRuleResponse(rule) });
  } catch (error) {
    return res.status(502).json({ error: { code: "AUTOMATION_SETUP_FAILED", message: error instanceof AutomationServiceError ? error.message : "Automation rule could not be updated." } });
  }
});

router.delete(`${prefix}/rules/:id`, async (req, res) => {
  const id = uuid.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid rule ID." } });
  const deleted = await db.delete(rules).where(and(eq(rules.id, id.data), inactiveLease)).returning({ id: rules.id });
  if (!deleted.length) return res.status(409).json({ error: { code: "AUTOMATION_BUSY_OR_MISSING", message: "This rule is running or no longer exists." } });
  return res.json({ data: { id: id.data } });
});

router.post(`${prefix}/rules/:id/run`, async (req, res) => {
  const id = uuid.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid rule ID." } });
  const [rule] = await db.select({ id: rules.id }).from(rules).where(eq(rules.id, id.data));
  if (!rule) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Automation rule not found." } });
  try {
    // The persisted run is pollable immediately; no long-lived browser request.
    return res.status(202).json({ data: await beginAutomationRun(id.data) });
  } catch (error) {
    return res.status(409).json({ error: { code: error instanceof AutomationServiceError ? error.code : "AUTOMATION_RUN_FAILED", message: error instanceof AutomationServiceError ? error.message : "Could not start this import." } });
  }
});

router.get(`${prefix}/rules/:id/runs`, async (req, res) => {
  const id = uuid.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid rule ID." } });
  return res.json({ data: await listAutomationRuns(id.data) });
});

export default router;