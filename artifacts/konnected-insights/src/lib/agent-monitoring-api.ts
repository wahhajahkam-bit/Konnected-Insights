import { fetchApi } from './api';

export type AgentRunStatus = "running" | "succeeded" | "partial" | "failed" | "interrupted";
export type AgentRunProvenance = "automatic" | "historical" | "manual";
export type AgentCostStatus = "unknown" | "partial" | "priced";
export type AgentOutcome = string;

export interface AgentCost {
  currency: string;
  amount: number;
  provenance: "estimated" | "manual";
}

export interface AgentRun {
  id: string;
  agentId: string;
  category: "website" | "replit";
  label: string | null;
  status: AgentRunStatus;
  startedAt: string;
  finishedAt: string | null;
  elapsedMs: number | null;
  parentRunId: string | null;
  sourceId: string | null;
  provenance: AgentRunProvenance;
  outcome: AgentOutcome | null;
  outputPath: string | null;
  costAmount: number | null;
  currency: string | null;
  reference: string | null;
  notes: string | null;
  enteredBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  costStatus: AgentCostStatus;
  costs: AgentCost[];
}

export interface AgentOperation {
  id: string;
  runId: string;
  key: string;
  model: string | null;
  inputTokens: number | null;
  inputTextTokens?: number | null;
  inputImageTokens?: number | null;
  outputTokens: number | null;
  outputTextTokens?: number | null;
  outputImageTokens?: number | null;
  cachedTokens: number | null;
  toolCalls: number | null;
  costAmount: number | null;
  currency: string | null;
  pricingVersion: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  providerCallMs?: number | null;
  elapsedMs?: number | null;
  pricingSource?: string | null;
  pricingEffectiveDate?: string | null;
  partial?: boolean;
  breakdown?: Array<{label: string; amount: number}>;
}

export interface AgentAudit {
  action: string;
  actor: string;
  at: string;
}

export interface AgentInventoryItem {
  id: string;
  name: string;
  purpose: string;
  enabled: boolean | null;
  schedule: string | null;
  latestActivity: string | null;
}

export interface HistoryCoverage {
  complete: boolean;
  remainingRuns: number;
  message: string;
}

export interface AgentInventory {
  agents: AgentInventoryItem[];
  trackingSince: string | null;
  replitLiveConnected: boolean;
  historyCoverage: HistoryCoverage;
}

export interface AgentRunsListResponse {
  items: AgentRun[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AgentSummaryCost {
  currency: string;
  amount: number;
  provenance: "estimated" | "manual";
}

export interface AgentSummaryByAgent {
  agentId: string;
  runs: number;
  succeeded: number;
  failed: number;
  elapsedMs: number;
}

export interface AgentSummaryResponse {
  runs: number;
  succeeded: number;
  failed: number;
  running: number;
  partial: number;
  interrupted: number;
  elapsedMs: number;
  unknownCostRuns: number;
  partialCostRuns: number;
  costs: AgentSummaryCost[];
  trackingSince: string | null;
  historyCoverage: HistoryCoverage;
  byAgent: AgentSummaryByAgent[];
}

export interface AgentRunDetails {
  run: AgentRun;
  children: AgentRun[];
  operations: AgentOperation[];
  audit: AgentAudit[];
  source?: {
    counts: Record<string, number>;
    outputs: Array<{ label: string; path: string }>;
  };
}

export type ManualRunPayload = {
  label: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  costAmount?: number;
  currency?: string;
  reference?: string;
  notes?: string;
  status?: AgentRunStatus;
};

export const agentMonitoringApi = {
  getInventory: () =>
    fetchApi('/api/editorial/agents/') as Promise<{ data: AgentInventory }>,

  getRuns: (params: {
    category?: 'website' | 'replit' | 'all';
    agentId?: string;
    status?: AgentRunStatus | 'all';
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const search = new URLSearchParams();
    if (params.category && params.category !== 'all') search.set('category', params.category);
    if (params.agentId) search.set('agentId', params.agentId);
    if (params.status && params.status !== 'all') search.set('status', params.status);
    if (params.from) search.set('from', params.from);
    if (params.to) search.set('to', params.to);
    if (params.page) search.set('page', String(params.page));
    if (params.pageSize) search.set('pageSize', String(params.pageSize));

    const qs = search.toString() ? `?${search.toString()}` : '';
    return fetchApi(`/api/editorial/agents/runs${qs}`) as Promise<{ data: AgentRunsListResponse }>;
  },

  getSummary: (params: {
    category?: 'website' | 'replit' | 'all';
    agentId?: string;
    status?: AgentRunStatus | 'all';
    from?: string;
    to?: string;
  }) => {
    const search = new URLSearchParams();
    if (params.category && params.category !== 'all') search.set('category', params.category);
    if (params.agentId) search.set('agentId', params.agentId);
    if (params.status && params.status !== 'all') search.set('status', params.status);
    if (params.from) search.set('from', params.from);
    if (params.to) search.set('to', params.to);

    const qs = search.toString() ? `?${search.toString()}` : '';
    return fetchApi(`/api/editorial/agents/summary${qs}`) as Promise<{ data: AgentSummaryResponse }>;
  },

  getRunDetails: (id: string) =>
    fetchApi(`/api/editorial/agents/runs/${id}`) as Promise<{ data: AgentRunDetails }>,

  createManualRun: (payload: ManualRunPayload) =>
    fetchApi('/api/editorial/agents/manual', {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ data: AgentRun }>,

  updateManualRun: (id: string, payload: ManualRunPayload) =>
    fetchApi(`/api/editorial/agents/manual/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ data: AgentRun }>,

  deleteManualRun: (id: string) =>
    fetchApi(`/api/editorial/agents/manual/${id}`, {
      method: 'DELETE',
    }) as Promise<{ data: { id: string } }>,
};
