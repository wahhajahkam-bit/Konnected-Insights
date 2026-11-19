import assert from "node:assert/strict";
import test from "node:test";
import { estimateAgentCost, extractAgentUsage } from "./agentPricing";
import { monitoredProviderCall } from "./agentInstrumentation";

test("verified standard text pricing subtracts cached input, never double charging it", () => {
  const result = estimateAgentCost("gpt-5.4-mini", { inputTokens: 1_000_000, cachedTokens: 200_000, outputTokens: 100_000 });
  assert.equal(result.costStatus, "priced");
  assert.ok(Math.abs(result.costAmount! - 1.065) < 1e-10);
  assert.equal(result.pricingEffectiveDate, "2026-09-21");
  assert.match(result.pricingSource, /developers\.openai\.com/);
});
test("search token pricing adds observed web search calls exactly once", () => {
  const result = estimateAgentCost("gpt-5.4-mini", { inputTokens: 1000, cachedTokens: 0, outputTokens: 100, toolCalls: 2 }, "search");
  assert.ok(Math.abs(result.costAmount! - 0.0212) < 1e-10);
  assert.equal(result.costStatus, "priced");
});
test("unknown models, absent usage and invalid cache totals remain unavailable", () => {
  assert.equal(estimateAgentCost("unknown", { inputTokens: 1 }).costAmount, null);
  assert.equal(estimateAgentCost("gpt-5.4-mini", {}).costStatus, "unknown");
  assert.equal(estimateAgentCost("gpt-5.4-mini", { inputTokens: 1, cachedTokens: 2 }).costStatus, "unknown");
  assert.equal(estimateAgentCost("gpt-5.4-mini", { outputTokens: -1 }).costAmount, null);
});
test("missing cache or search counters produce explicitly partial lower bounds", () => {
  const text = estimateAgentCost("gpt-5.4-mini", { inputTokens: 100, outputTokens: 100 });
  assert.equal(text.costStatus, "partial");
  assert.equal(text.costAmount, 0.00045);
  assert.equal(estimateAgentCost("gpt-5.4-mini", { inputTokens: 100, cachedTokens: 0, outputTokens: 100 }, "search").costStatus, "partial");
});
test("image text/image inputs use different rates and unknown caching is partial", () => {
  const usage = { inputTokens: 300, inputTextTokens: 100, inputImageTokens: 200, outputTokens: 1000, cachedTokens: 0 };
  assert.equal(estimateAgentCost("gpt-image-1", usage, "image").costAmount, 0.0425);
  assert.equal(estimateAgentCost("gpt-image-1", { ...usage, cachedTokens: undefined }, "image").costStatus, "partial");
});
test("usage extraction strictly allowlists numeric usage and observed tool counts", () => {
  const response = { prompt: "secret", body: "private", usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 10 }, secret: "private" } };
  assert.deepEqual(extractAgentUsage(response, "text"), { inputTokens: 100, outputTokens: 20, cachedTokens: 10, inputTextTokens: undefined, inputImageTokens: undefined });
  assert.equal(extractAgentUsage({ usage: {}, output: [{ type: "web_search_call" }, { type: "message", content: "private" }] }, "search").toolCalls, 1);
  assert.equal(extractAgentUsage({ usage: { input_tokens: Infinity } }, "text").inputTokens, undefined);
  assert.equal(extractAgentUsage({ output: [{ type: "web_search_call" }] }, "search").toolCalls, 1);
});
test("recording failures cannot alter the successful provider return", async () => {
  const result = { usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 0 } }, private: "not logged" };
  assert.equal(await monitoredProviderCall("gpt-5.4-mini", "text", async () => result, async () => { throw new Error("database unavailable"); }), result);
});
test("failed provider calls preserve error identity and safe usage with elapsed timing", async () => {
  const failure = Object.assign(new Error("private email"), { usage: { input_tokens: 4 } });
  let record: any;
  await assert.rejects(monitoredProviderCall("gpt-5.4-mini", "text", async () => { throw failure; }, async value => { record = value; }), error => error === failure);
  assert.match(record.key, /^failed-/);
  assert.equal(record.inputTokens, 4);
  assert.ok(record.providerCallMs >= 0);
  assert.ok(record.startedAt instanceof Date);
  assert.doesNotMatch(JSON.stringify(record), /private email/);
});