import { ApiError, fetchApi } from '@/lib/api';
import type { FwPresentation } from '@/lib/api-future-work';
import type { FutureWorkSourcePreflightResponse } from '@workspace/api-client-react';

export type FutureWorkPresentation = FwPresentation;

export type FutureWorkStatus = 'published' | 'pending_review' | 'flagged' | 'rejected' | 'unpublished';

export type FutureWorkEvidence = {
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  fetchedAt: string | null;
  excerpt: string;
  authenticity: string;
  contentHash: string;
};

export type FutureWorkFunction = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  enabled: boolean;
  revision: number;
  presentation?: FutureWorkPresentation;
  researchSources?: FutureWorkResearchSources | null;
};

export type FutureWorkResearchSources = {
  urls: string[];
  instructions: string;
};

type VersionFields = {
  id: string;
  functionId: string;
  status: FutureWorkStatus;
  sources: FutureWorkEvidence[];
  lastVerifiedAt: string | null;
  updatedAt: string;
  revision: number;
  previousVersionId?: string | null;
  stale?: boolean;
  publishedAt?: string | null;
};

export type FutureWorkContent = VersionFields & {
  horizon: 2030 | 2050 | 2100;
  lens: 'technology' | 'field';
  title: string;
  summary: string;
  skills: string[];
};

export type FutureWorkProgram = VersionFields & {
  organization: string;
  programName: string;
  description: string;
  sourceUrl?: string;
  classification?: string;
  rationale?: string;
};

export type FutureWorkNews = VersionFields & {
  title: string;
  summary?: string;
};

export type FutureWorkSchedule = {
  id: '2030' | '2050' | '2100' | 'programs' | 'news';
  enabled: boolean;
  revision: number;
  nextRunAt: string | null;
  sourceWindowMonths: number;
  staleAfterDays: number;
  verificationOnlyOptIn: boolean;
};

export type RunResultEntry = {
  combination: {
    functionId: string;
    name: string;
    horizon?: string | number;
    lens?: string;
    kind: string;
    topic?: string;
    researchSources?: FutureWorkResearchSources | null;
  };
  outcome?: 'published' | 'unchanged' | 'nothing_found' | 'failed' | 'skipped' | 'draft_created';
  result: string;
  searchQuery?: string;
  url?: string;
  title?: string;
  versionId?: string;
  rejected?: { url: string; reason: string }[];
  attempts?: { searchQuery: string; urls: string[] }[];
} | string;

export type FutureWorkRun = {
  id: string;
  scheduleId: FutureWorkSchedule['id'] | 'research';
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  processed: number;
  sourcesFound: number;
  sourcesAccepted: number;
  sourcesRejected: number;
  errors?: string[] | null;
  usage?: unknown;
  results?: RunResultEntry[];
  plan?: {
    functionId?: string;
    name?: string;
    kind: string;
    horizon?: string | number;
    lens?: string;
    topic?: string;
    researchSources?: FutureWorkResearchSources | null;
  }[];
  outcomeCounts?: Record<string, number>;
};

export type FutureWorkFreshness = {
  status: 'current' | 'overdue' | 'unrefreshed';
  oldestUpdatedAt: string | null;
  overdueCount: number;
  label: string;
  href: string;
  itemId?: string | null;
};

export type AdminFutureWorkData = {
  functions: FutureWorkFunction[];
  content: FutureWorkContent[];
  programs: FutureWorkProgram[];
  news: FutureWorkNews[];
  schedules: FutureWorkSchedule[];
  runs: FutureWorkRun[];
  decisions?: { versionId: string; action: string; reason: string; actor: string; createdAt: string }[];
  freshness: FutureWorkFreshness;
};

export type ReviewKind = 'content' | 'programs' | 'news';
export type ReviewAction = 'approve' | 'reject' | 'edit' | 'unpublish' | 'restore';

const root = '/api/editorial/future-work';

export const adminFutureWorkApi = {
  preflight: async (id: string, revision: number, sourceIndex: number) =>
    (await fetchApi(`${root}/functions/${id}/source-preflight`, {
      method: 'POST', body: JSON.stringify({ revision, sourceIndex }),
    }) as FutureWorkSourcePreflightResponse).data,
  get: async () => (await fetchApi(root) as { data: AdminFutureWorkData }).data,
  runHistory: async (functionId: string, category: string, cursor?: string) => {
    const params = new URLSearchParams({ category, limit: '20' });
    if (functionId) params.set('functionId', functionId);
    if (cursor) params.set('cursor', cursor);
    return (await fetchApi(`${root}/history/runs?${params}`) as {
      data: { items: FutureWorkRun[]; nextCursor: string | null };
    }).data;
  },
  createFunction: async (data: Omit<FutureWorkFunction, 'id' | 'revision'>) =>
    (await fetchApi(`${root}/functions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }) as { data: FutureWorkFunction }).data,
  updateFunction: async (id: string, data: Partial<FutureWorkFunction> & { revision: number }) =>
    (await fetchApi(`${root}/functions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }) as { data: FutureWorkFunction }).data,
  review: async (
    kind: ReviewKind,
    id: string,
    data: {
      action: ReviewAction;
      revision: number;
      reason?: string;
      changes?: Record<string, string | string[]>;
    },
  ) => (await fetchApi(`${root}/review/${kind}/${id}`, {
    method: 'POST',
    body: JSON.stringify(data),
  }) as { data: FutureWorkContent | FutureWorkProgram | FutureWorkNews }).data,
  updateSchedule: async (
    id: FutureWorkSchedule['id'],
    data: Partial<FutureWorkSchedule> & { revision: number },
  ) => (await fetchApi(`${root}/schedules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }) as { data: FutureWorkSchedule }).data,
  run: async (scheduleId: FutureWorkSchedule['id'], maxCombinations: number) =>
    (await fetchApi(`${root}/runs`, {
      method: 'POST',
      body: JSON.stringify({ scheduleId, maxCombinations }),
    }) as { data: FutureWorkRun }).data,
  research: async (data: {
    functionIds?: string[];
    categories?: Array<'2030' | '2050' | '2100' | 'news' | 'programs'>;
    topic?: string;
  }) => (await fetchApi(`${root}/research`, {
    method: 'POST',
    body: JSON.stringify(data),
  }) as { data: FutureWorkRun }).data,
};

export function futureWorkErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 409) {
    return 'This record changed in another session. The latest data has been reloaded; review it before trying again.';
  }
  return error instanceof Error ? error.message : 'The request could not be completed.';
}