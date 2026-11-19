import { randomUUID } from "node:crypto";
import type { AgentOperationInput } from "./agentMonitoring";
import { estimateAgentCost, extractAgentUsage, type OperationKind } from "./agentPricing";

/** Business result/error identity is preserved even when telemetry is unavailable. */
export async function monitoredProviderCall<T>(
  model: string, kind: OperationKind, call: () => Promise<T>,
  record: (input: AgentOperationInput) => Promise<void> = async input =>
    (await import("./agentMonitoring")).recordAgentOperation(input),
): Promise<T> {
  const startedAt = new Date();
  let response: unknown;
  let status: "succeeded" | "failed" = "failed";
  try {
    const result = await call();
    response = result;
    status = "succeeded";
    return result;
  } catch (error) {
    // Some provider adapters attach usage to a failed response. Extract counters
    // only; the thrown error and its private response/body are never persisted.
    response = error;
    throw error;
  } finally {
    try {
      const usage = extractAgentUsage(response, kind);
      const price = estimateAgentCost(model, usage, kind);
      const finishedAt = new Date();
      await record({ key: `${status}-${randomUUID()}`, model, ...usage,
        ...price, costAmount: price.costAmount ?? undefined, partial: price.costStatus === "partial",
        startedAt, finishedAt, providerCallMs: finishedAt.getTime() - startedAt.getTime() });
    } catch { /* Monitoring is never a publication dependency. */ }
  }
}