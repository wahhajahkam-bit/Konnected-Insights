import { fetchApi } from './api';

export type AutomationConnection = {
  connected: boolean;
  email?: string;
  error?: string;
};

export type AutomationRule = {
  id: string;
  name: string;
  collection: 'newsletters' | 'masterclasses' | 'future-work' | 'events' | 'talks' | 'contributors' | 'communities';
  senders: string[];
  search: string;
  guidance: string;
  enabled: boolean;
  publishMode: 'draft' | 'automatic';
  scheduleUtc: string;
  lookbackDays: number;
  maxItems: number;
  nextRunAt?: string;
  lastRunAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type AutomationRun = {
  id: string;
  ruleId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  finishedAt?: string;
  matched: number;
  created: number;
  skipped: number;
  failed: number;
  error?: string;
};

export const editorialAutomationApi = {
  getConnection: () =>
    fetchApi('/api/editorial/automation/connection') as Promise<{ data: AutomationConnection }>,
  
  getRules: () =>
    fetchApi('/api/editorial/automation/rules') as Promise<{ data: AutomationRule[] }>,

  createRule: (data: Partial<AutomationRule> & { confirmAutomaticPublishing?: boolean }) =>
    fetchApi('/api/editorial/automation/rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }) as Promise<{ data: AutomationRule }>,

  updateRule: (id: string, data: Partial<AutomationRule> & { confirmAutomaticPublishing?: boolean }) =>
    fetchApi(`/api/editorial/automation/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }) as Promise<{ data: AutomationRule }>,

  deleteRule: (id: string) =>
    fetchApi(`/api/editorial/automation/rules/${id}`, {
      method: 'DELETE',
    }),

  runRule: (id: string) =>
    fetchApi(`/api/editorial/automation/rules/${id}/run`, {
      method: 'POST',
    }) as Promise<{ data: AutomationRun }>,

  getRuns: (id: string) =>
    fetchApi(`/api/editorial/automation/rules/${id}/runs`) as Promise<{ data: AutomationRun[] }>,
};
