import { AsyncLocalStorage } from "node:async_hooks";
import { pool } from "@workspace/db";
import { agentIds, safeCode, safeOutputPath } from "./agentMonitoringPolicy";

const context = new AsyncLocalStorage<string | null>();
export const currentAgentRunId = () => context.getStore() ?? null;
export const inAgentRun = <T>(id: string | null, callback: () => Promise<T>): Promise<T> => context.run(id, callback);
type RunInput = { agentId: typeof agentIds[number]; sourceId?: string; parentRunId?: string | null; label?: string; startedAt?: Date | string };
async function failOpen<T>(action: () => Promise<T>): Promise<T | null> {
  try { return await action(); } catch { return null; }
}
export async function startAgentRun(input: RunInput): Promise<string | null> {
  return failOpen(async () => {
    if (!agentIds.includes(input.agentId)) return null;
    const row = await pool.query(`INSERT INTO agent_runs(agent_id,category,label,source_id,parent_run_id,started_at)
      VALUES($1,'website',$2,$3,$4,coalesce($5::timestamptz,now()))
      ON CONFLICT(agent_id,source_id) DO UPDATE SET heartbeat_at=now(),
        provenance='automatic',parent_run_id=coalesce(agent_runs.parent_run_id,excluded.parent_run_id) RETURNING id`,
    [input.agentId, safeCode(input.label) ?? input.agentId, input.sourceId ?? null, input.parentRunId === undefined ? currentAgentRunId() : input.parentRunId, input.startedAt ?? null]);
    // If the history adapter won the insertion race, replace its usage with newly captured operations.
    await pool.query("DELETE FROM agent_operations WHERE run_id=$1 AND key LIKE 'historical-%'", [row.rows[0].id]);
    return row.rows[0].id as string;
  });
}
export async function heartbeatAgentRun(id: string | null) {
  if (id) await failOpen(() => pool.query("UPDATE agent_runs SET heartbeat_at=now() WHERE id=$1 AND status='running'", [id]));
}
export async function finishAgentRun(id: string | null, result: { status: "succeeded" | "partial" | "failed"; outcome?: string; outputPath?: string }) {
  if (id) await failOpen(() => pool.query(`UPDATE agent_runs SET status=$2,outcome=$3,output_path=$4,finished_at=now(),updated_at=now(),heartbeat_at=now()
    WHERE id=$1 AND status='running'`, [id, result.status, safeCode(result.outcome), safeOutputPath(result.outputPath)]));
}
export async function withAgentRun<T>(input: RunInput, callback: (runId: string | null) => Promise<T>): Promise<T> {
  const id = await startAgentRun(input);
  const timer = setInterval(() => { void heartbeatAgentRun(id); }, 60000);
  timer.unref();
  try {
    return await inAgentRun(id, async () => {
      try { const value = await callback(id); await finishAgentRun(id, { status: "succeeded" }); return value; }
      catch (error) { await finishAgentRun(id, { status: "failed", outcome: "Operation failed" }); throw error; }
    });
  } finally { clearInterval(timer); }
}
export type AgentOperationInput = {
  runId?: string | null; key: string; model?: string; inputTokens?: number; outputTokens?: number;
  cachedTokens?: number; toolCalls?: number; costAmount?: number; currency?: string; pricingVersion?: string;
  inputTextTokens?: number; inputImageTokens?: number; outputTextTokens?: number; outputImageTokens?: number;
  startedAt?: Date | string; finishedAt?: Date | string; providerCallMs?: number;
  pricingSource?: string; pricingEffectiveDate?: string; partial?: boolean;
  breakdown?: Array<{ label: string; amount: number }>;
};
export async function recordAgentOperation(input: AgentOperationInput) {
  const id = input.runId === undefined ? currentAgentRunId() : input.runId;
  if (!id) return;
  const count = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
  const cost = typeof input.costAmount === "number" && Number.isFinite(input.costAmount) && input.costAmount >= 0 && /^[A-Z]{3}$/.test(input.currency ?? "") ? input.costAmount : null;
  const breakdown = input.breakdown?.slice(0, 20).filter(v => safeCode(v.label) && Number.isFinite(v.amount) && v.amount >= 0).map(v => ({ label: safeCode(v.label), amount: v.amount }));
  await failOpen(() => pool.query(`INSERT INTO agent_operations(run_id,key,model,input_tokens,output_tokens,cached_tokens,tool_calls,cost_amount,currency,pricing_version,started_at,finished_at,provider_call_ms,pricing_source,pricing_effective_date,partial,breakdown,input_text_tokens,input_image_tokens,output_text_tokens,output_image_tokens)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) ON CONFLICT(run_id,key) DO NOTHING`,
  [id, safeCode(input.key) ?? "provider-call", safeCode(input.model), count(input.inputTokens), count(input.outputTokens), count(input.cachedTokens), count(input.toolCalls), cost, cost === null ? null : input.currency, safeCode(input.pricingVersion),
    input.startedAt ?? null, input.finishedAt ?? null, count(input.providerCallMs), safeCode(input.pricingSource), safeCode(input.pricingEffectiveDate), input.partial === true, breakdown ? JSON.stringify(breakdown) : null,
    count(input.inputTextTokens), count(input.inputImageTokens), count(input.outputTextTokens), count(input.outputImageTokens)]));
}