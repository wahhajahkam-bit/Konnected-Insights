// Standard public API list-price estimates, NOT proxy charges or invoices.
// Verified against official model pages on 2026-09-21. Never back-price old runs.
export const AGENT_PRICING_VERSION = "openai-standard-2026-09-21";
export type AgentUsage = {
  inputTokens?: number; outputTokens?: number; cachedTokens?: number;
  inputTextTokens?: number; inputImageTokens?: number; toolCalls?: number;
};
export type OperationKind = "text" | "image" | "search";
export function estimateAgentCost(model: string, usage: AgentUsage, kind: OperationKind = "text") {
  const source = model === "gpt-image-1" ? "developers.openai.com/api/docs/models/gpt-image-1"
    : model === "gpt-5.4-mini" ? "developers.openai.com/api/docs/models/gpt-5.4-mini"
    : "developers.openai.com/api/docs/pricing";
  const base = { currency: "USD" as const, pricingVersion: AGENT_PRICING_VERSION,
    pricingSource: kind === "search" ? "developers.openai.com/api/docs/pricing" : source,
    pricingEffectiveDate: "2026-09-21" };
  const valid = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (![ "gpt-5.4-mini", "gpt-image-1" ].includes(model) ||
    Object.values(usage).some(n => n !== undefined && !valid(n)) ||
    (usage.cachedTokens ?? 0) > (usage.inputTokens ?? 0)) {
    return { ...base, costAmount: null, costStatus: "unknown" as const };
  }
  let amount = 0, known = false, complete = true;
  const breakdown: Array<{ label: string; amount: number }> = [];
  const add = (label: string, cost: number) => { amount += cost; known = true; breakdown.push({ label, amount: cost }); };
  if (model === "gpt-5.4-mini") {
    if (valid(usage.inputTokens) && valid(usage.cachedTokens)) {
      add("Uncached input", (usage.inputTokens - usage.cachedTokens) * 0.75 / 1e6);
      add("Cached input", usage.cachedTokens * 0.075 / 1e6);
    } else complete = false;
    if (valid(usage.outputTokens)) add("Output", usage.outputTokens * 4.5 / 1e6);
    else complete = false;
  } else {
    // Image input caching cannot be split safely without modality-specific cache
    // counts. Price only explicitly uncached inputs; keep other cases partial.
    if (usage.cachedTokens === 0 && valid(usage.inputTextTokens) && valid(usage.inputImageTokens) &&
      usage.inputTextTokens + usage.inputImageTokens === usage.inputTokens) {
      add("Image model text input", usage.inputTextTokens * 5 / 1e6);
      add("Image model image input", usage.inputImageTokens * 10 / 1e6);
    } else complete = false;
    if (valid(usage.outputTokens)) add("Image output", usage.outputTokens * 40 / 1e6);
    else complete = false;
  }
  if (kind === "search") {
    if (valid(usage.toolCalls)) add("Web search preview calls", usage.toolCalls * 0.01);
    else complete = false;
  }
  return { ...base, costAmount: known ? amount : null, breakdown,
    costStatus: known ? (complete ? "priced" as const : "partial" as const) : "unknown" as const };
}

/** Only numeric usage counters; never return raw provider data or errors. */
export function extractAgentUsage(response: unknown, kind: OperationKind): AgentUsage {
  const r = response as Record<string, any> | null;
  const usage = r?.usage;
  const tools = kind === "search" && Array.isArray(r?.output)
    ? { toolCalls: r.output.filter((item: any) => item?.type === "web_search_call").length }
    : {};
  if (!usage || typeof usage !== "object") return tools;
  const value = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : undefined;
  const details = usage.input_tokens_details ?? usage.prompt_tokens_details;
  const result: AgentUsage = {
    ...tools,
    inputTokens: value(usage.input_tokens ?? usage.prompt_tokens),
    outputTokens: value(usage.output_tokens ?? usage.completion_tokens),
    cachedTokens: value(details?.cached_tokens),
    inputTextTokens: value(details?.text_tokens),
    inputImageTokens: value(details?.image_tokens),
  };
  return result;
}