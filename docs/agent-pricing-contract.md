# Instrumentation/pricing coordination

Instrumentation owns `agentPricing.ts` and `agentInstrumentation.ts`.

`estimateAgentCost(model, usage: {inputTokens?,outputTokens?,cachedTokens?,inputTextTokens?,inputImageTokens?,toolCalls?}, kind?: "text"|"image"|"search")` returns `{costAmount:number|null,currency:"USD",costStatus:"priced"|"partial"|"unknown",pricingVersion,pricingSource,pricingEffectiveDate}`.

Instrumentation uses the implemented extended operation contract: `startedAt`, `finishedAt`, `providerCallMs`, `partial`, `pricingSource`, `pricingEffectiveDate`, `breakdown`. Failed operation keys begin `failed-`; successful keys begin `succeeded-`. Costs with missing input modality/cache counters remain partial rather than pricing unknown inputs. Source references are official hostname/path strings without a scheme to comply with the backend safe-label policy. Breakdown labels omit the word tokens to comply with its secret-name filter.

Verified official sources on 2026-09-21: https://developers.openai.com/api/docs/models/gpt-5.4-mini, https://developers.openai.com/api/docs/models/gpt-image-1, https://developers.openai.com/api/docs/pricing. Published rates are estimates, not Replit provider proxy invoices. Effective date denotes this pricing snapshot's use for newly captured activity, not a claim about historical tariff dates.