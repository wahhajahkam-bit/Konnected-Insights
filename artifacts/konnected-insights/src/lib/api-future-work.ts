import { fetchApi } from './api';

export type FwPresentation = {
  heroCoverUrl?: string;
  heroAlt?: string;
  heroCredit?: string;
  shortIntroduction?: string;
  sectionIntroductions?: Partial<Record<'overview' | 'outlook' | 'skills' | 'news' | 'programs' | 'sources', string>>;
};

export type FwFunction = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  enabled: boolean;
  revision: number;
  presentation?: FwPresentation;
};

export type FwEvidence = {
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  fetchedAt: string | null;
  excerpt?: string;
  authenticity: string;
  contentHash: string;
};

export type FwContent = {
  id: string;
  functionId: string;
  horizon: 2030 | 2050 | 2100;
  lens: 'technology' | 'field';
  title: string;
  summary: string;
  skills: string[];
  sources: FwEvidence[];
  status: string;
  lastVerifiedAt: string | null;
  updatedAt: string;
  revision: number;
  previousVersionId?: string;
  stale: boolean;
  publishedAt: string | null;
};

export type FwProgram = {
  id: string;
  functionId: string;
  organization: string;
  programName: string;
  description: string;
  sourceUrl: string;
  sources: FwEvidence[];
  lastVerifiedAt: string | null;
  classification: string;
  rationale: string;
  status: string;
  revision: number;
  stale?: boolean;
  updatedAt?: string;
};


export type FwNews = {
  id: string;
  functionId: string;
  title: string;
  summary: string;
  sources: FwEvidence[];
  stale: boolean;
  publishedAt: string | null;
  lastVerifiedAt: string | null;
  updatedAt: string;
};

export type FwFreshness = {
  status: 'current' | 'overdue' | 'unrefreshed';
  oldestUpdatedAt: string | null;
  overdueCount: number;
  label: string;
  href: string;
  itemId?: string | null;
};

export type FwHorizon = {
  year: number;
  label: string;
  disclaimer: string;
};

export type FwOverviewResponse = {
  functions: FwFunction[];
  content: FwContent[];
  programs: FwProgram[];
  news: FwNews[];
  freshness: FwFreshness;
  horizons: FwHorizon[];
};

export type FwFunctionResponse = {
  function: FwFunction;
  content: FwContent[];
  programs: FwProgram[];
  skills: string[];
  news?: FwNews[];
};

export const futureWorkApi = {
  getOverview: () => fetchApi('/api/future-work') as Promise<{ data: FwOverviewResponse }>,
  getFreshness: () => fetchApi('/api/future-work/freshness') as Promise<{ data: FwFreshness }>,
  getFunction: (slug: string) => fetchApi(`/api/future-work/functions/${slug}`) as Promise<{ data: FwFunctionResponse }>,
};
