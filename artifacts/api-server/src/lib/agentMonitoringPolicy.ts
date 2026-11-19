import { z } from "zod/v4";

export const agentIds = ["editorial-draft", "image-generation", "gmail-automation", "newsletter-ingestion", "future-work-research"] as const;
export const statuses = ["running", "succeeded", "partial", "failed", "interrupted"] as const;
export const monitoringFilters = z.object({
  category: z.enum(["website", "replit"]).optional(),
  agentId: z.enum([...agentIds, "replit-development"]).optional(),
  status: z.enum(statuses).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine(v => !v.from || !v.to || Date.parse(v.from) < Date.parse(v.to), "Start must precede end");

export const manualSession = z.object({
  label: z.string().trim().min(1).max(200),
  startedAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso.datetime({ offset: true }).optional(),
  durationMs: z.number().finite().min(0).max(365 * 86400000).optional(),
  costAmount: z.number().finite().min(0).max(100000000).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  reference: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  status: z.enum(["succeeded", "partial", "failed", "interrupted"]).default("succeeded"),
}).strict().superRefine((v, ctx) => {
  if ((v.finishedAt === undefined) === (v.durationMs === undefined)) ctx.addIssue({ code: "custom", message: "Provide end time or duration, not both", path: ["finishedAt"] });
  if (v.finishedAt && Date.parse(v.finishedAt) < Date.parse(v.startedAt)) ctx.addIssue({ code: "custom", message: "End precedes start", path: ["finishedAt"] });
  if (v.finishedAt && Date.parse(v.finishedAt) - Date.parse(v.startedAt) > 365 * 86400000) ctx.addIssue({ code: "custom", message: "Duration cannot exceed 365 days", path: ["finishedAt"] });
  if ((v.costAmount === undefined) !== (v.currency === undefined)) ctx.addIssue({ code: "custom", message: "Cost and currency must be provided together", path: ["currency"] });
});
export const safeCode = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9 _.:/-]{1,120}$/.test(v) && !/https?:|@|bearer|token|password|secret/i.test(v) ? v : null;
export const safeOutputPath = (v: unknown) => typeof v === "string" && /^\/admin(?:\/(?:research|future-work|automation))?(?:\?(?:newsletterId|runId)=[a-f0-9-]{36})?$/.test(v) ? v : null;
export function effectiveStatus(row: { status: string; heartbeat_at: Date | string }, now = Date.now()) {
  return row.status === "running" && now - new Date(row.heartbeat_at).getTime() > 30 * 60_000 ? "interrupted" : row.status;
}