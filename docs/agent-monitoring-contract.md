# Agent monitoring contract

Backend module: `artifacts/api-server/src/lib/agentMonitoring.ts`.
All telemetry helpers are fail-open (resolve null/void on database failure), never accept prompts, bodies, arbitrary metadata, or raw errors.

Instrumentation interfaces:
- `startAgentRun({agentId, sourceId?, parentRunId?, label?, startedAt?}): Promise<string|null>`; sourceId is the durable existing run UUID (idempotency key). Parent defaults to AsyncLocalStorage current run. Agent IDs: editorial-draft, image-generation, gmail-automation, newsletter-ingestion, future-work-research.
- `withAgentRun(input, async (runId: string|null)=> result)` creates context, finishes succeeded/failed automatically (generic error only), rethrows business errors unchanged. For workers whose business failure is returned, use start/context/finish explicitly.
- `inAgentRun(runId: string|null, callback)` establishes async parent context.
- `finishAgentRun(runId, {status: "succeeded"|"partial"|"failed", outcome?: string, outputPath?: string}): Promise<void>`. Outcome is a controlled short code, not user/provider text. outputPath accepts CMS paths only.
- `heartbeatAgentRun(runId): Promise<void>`.
- `recordAgentOperation({runId?: string|null, key: string, model?: string, inputTokens?: number, outputTokens?: number, cachedTokens?: number, toolCalls?: number, costAmount?: number, currency?: string, pricingVersion?: string}): Promise<void>`; defaults runId to context. Key must uniquely identify actual call within run. Cost null/absent means unavailable. Instrumentation worker owns pricing; pass estimated cost, currency USD, and pricingVersion. No price inference in monitoring.
- `currentAgentRunId(): string|null`.

HTTP prefix `/api/editorial/agents`, all endpoints administrator-only, all success envelopes `{data: ...}`. Errors `{error:{code,message}}`.
- GET `/`: inventory `{agents: [{id,name,purpose,enabled:boolean|null,schedule:string|null,latestActivity:string|null}], trackingSince:string|null, replitLiveConnected:false}`.
- GET `/runs`: filters `category=website|replit`, `agentId`, `status=running|succeeded|partial|failed|interrupted`, `from`, `to` ISO dates (inclusive start/exclusive end); `page` positive default 1, `pageSize` 1..100 default 25. Returns `{items: Run[], total, page, pageSize}`. Top-level runs only; children shown in detail, never aggregate counted twice.
- GET `/summary`: same filters; `{runs,succeeded,failed,running,partial,interrupted,elapsedMs,unknownCostRuns,partialCostRuns,costs:[{currency,amount,provenance}],trackingSince}`. Costs grouped by currency AND provenance (estimated/manual), never converted. Child operation costs roll into parent.
- GET `/runs/:id`: `{run:Run,children:Run[],operations:Operation[],audit:Audit[]}` operations include descendants.
- POST `/manual`, PATCH `/manual/:id`, DELETE `/manual/:id`: manual Replit records only. POST/PATCH input `{label,startedAt,finishedAt?,durationMs?,costAmount?,currency?,reference?,notes?,status?}`. Exactly finishedAt OR durationMs required, duration >=0. Default status succeeded. Costs optional but currency required with cost. PATCH full replacement, identity/created attribution preserved. DELETE soft deletes and appends audit. Returns Run (DELETE `{id}`).

Run fields: `id,agentId,category,label,status,startedAt,finishedAt,elapsedMs,parentRunId,sourceId,provenance` ("automatic"|"historical"|"manual"), `outcome,outputPath,costAmount,currency,reference,notes,enteredBy,updatedBy,createdAt,updatedAt,costStatus` ("unknown"|"partial"|"priced"), `costs:[{currency,amount,provenance}]`.
Operation fields: `id,runId,key,model,inputTokens,outputTokens,cachedTokens,toolCalls,costAmount,currency,pricingVersion,createdAt`. Missing usage is null, never synthetic zero.
Extended operation input/output also supports `startedAt,finishedAt,providerCallMs,pricingSource,pricingEffectiveDate,partial` and `breakdown` (array of `{label,amount}`); output `elapsedMs` is providerCallMs or timestamp difference. Only safe short pricing labels are stored. `partial=true` means the amount does not price the whole operation.
Summary also includes `byAgent` array of `{agentId,runs,succeeded,failed,elapsedMs}` under identical filters. Historical research usage maps only numeric input/output/cached tokens from known search/summary/support_review stages; absent model stays null and historical costs remain unknown.
Audit fields: `action,actor,at` (no sensitive payload snapshots).

Coverage: old Gmail/research/newsletter logs adapted idempotently by sourceId with only known outcomes/timestamps and allowlisted research token counts, no arbitrary historical payloads or error strings. Missing historic usage/cost explicitly unavailable. Runs without heartbeat for 30 minutes display interrupted, without modifying source workers. Runtime is elapsed wall-clock, not human work hours.

Deployment: run `pnpm --filter @workspace/db migrate:agent-monitoring` before deploying API/instrumentation. Migration is additive/repeatable; workers remain fail-open if schema unavailable. API responds 503 (not empty data) if monitoring unavailable.
History adaptation imports up to 500 missing records per source per minute on dashboard requests; older history is populated progressively. No retroactive model/cost inference. No-live-connection statement applies to Replit sessions.

Additional API fields (UI should render):
- Operation usage includes nullable `inputTextTokens,inputImageTokens,outputTextTokens,outputImageTokens`. Available exact provider modality counts only; missing modalities remain null. These are bigint database counts normalized to JSON numbers in the detail API.
- Inventory and summary both include `historyCoverage:{complete:boolean,remainingRuns:number,message:string}`. When false, prominently show message: filtered totals cover imported records only.
- Detail includes `source:{counts:Record<string,number>,outputs:Array<{label:string,path:string}>}`. Counters are allowlisted from actual source logs. Outputs only existing newsletter CMS drafts or existing research/automation screens; no email URLs or private title strings.

Run backend tests from `artifacts/api-server` with `node scripts/test-agent-monitoring.mjs`. HTTP tests use the real routes/admin middleware and isolated PostgreSQL schema; esbuild aliases ONLY Clerk's external SDK for test identities. No production authentication bypass exists.