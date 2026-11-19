import { ApiError } from './api';

export type RunReport = {
  id: string;
  status: 'running' | 'succeeded' | 'partial' | 'failed';
  startedAt: string;
  completedAt: string | null;
  fetched: number;
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
  drafts: { id: string; title: string }[];
  message: string;
  hasMore: boolean;
};

export type NewsletterSource = {
  id: string;
  name: string;
  senderEmail: string;
  subjectKeywords: string[];
  instructions: string;
  referenceUrls: string[];
  contributorId: string;
  enabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  nextRunAt: string | null;
  lastRun: RunReport | null;
};

export type NewsletterSourcesResponse = {
  sources: NewsletterSource[];
  scheduleUtc: string;
  mailbox: string | null;
  connectionError: string | null;
};

const fetchApi = async (path: string, options?: RequestInit) => {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    const serverError = errorData?.error;
    const serverMessage = typeof serverError === 'string'
      ? serverError
      : serverError?.message;
    throw new ApiError(
      serverMessage || `The CMS API request failed (${res.status})`,
      res.status,
      typeof serverError === 'object' ? serverError?.code : undefined,
      typeof serverError === 'object' ? serverError?.details : undefined,
    );
  }

  if (res.status === 204) return null;
  return res.json();
};

export const newsletterSourcesApi = {
  list: () => fetchApi('/api/newsletter-sources') as Promise<NewsletterSourcesResponse>,
  
  create: (data: Partial<NewsletterSource>) => 
    fetchApi('/api/newsletter-sources', {
      method: 'POST',
      body: JSON.stringify(data),
    }) as Promise<NewsletterSource>,
    
  update: (id: string, expectedVersion: number, data: Partial<NewsletterSource>) => 
    fetchApi(`/api/newsletter-sources/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ expectedVersion, ...data }),
    }) as Promise<NewsletterSource>,
    
  delete: (id: string, expectedVersion: number) => 
    fetchApi(`/api/newsletter-sources/${id}?expectedVersion=${expectedVersion}`, {
      method: 'DELETE',
    }),
    
  check: (id: string) => 
    fetchApi(`/api/newsletter-sources/${id}/check`, {
      method: 'POST',
    }) as Promise<RunReport>,
};
