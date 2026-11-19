export type EditorialItem = {
  id: string;
  collection: string;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  sortOrder: number;
  data: any;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type EditorialStaffRole = 'owner' | 'admin' | 'editor';

export type EditorialAccess = {
  allowed: boolean;
  role: EditorialStaffRole | null;
  email: string | null;
  canManageStaff: boolean;
};

export type EditorialStaffMember = {
  id: string;
  email: string;
  role: EditorialStaffRole;
  status: 'active' | 'invited' | 'expired';
  createdAt: string;
  updatedAt: string;
};

export type LinkedInIngestionReport = {
  sourceUrl: string;
  checkedAt: string;
  fetched: number;
  created: number;
  skipped: number;
  failed: number;
  drafts: Array<{ id: string; title: string; sourceId: string }>;
  errors: string[];
};

export type LinkedInIngestionStatus = {
  sourceUrl: string;
  configured: boolean;
  apiUrlConfigured: boolean;
  scheduleUtc: string;
  lastRun?: {
    startedAt: string;
    completedAt?: string;
    status: 'running' | 'succeeded' | 'failed';
    report?: LinkedInIngestionReport;
    error?: string;
  };
};

export type AiAutofillRequest = {
  collection: string;
  sourceUrl?: string;
  sourceText?: string;
  screenshotUrl?: string;
  screenshotUrls?: string[];
  guidance?: string;
  currentDraft: {
    title: string;
    slug: string;
    data: any;
  };
};

export type AiAutofillResponse = {
  title: string;
  slug: string;
  data: any;
  source: { url: string; title: string };
  feedback: {
    completed: string[];
    missing: string[];
    warnings: string[];
  };
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: Array<{ path?: Array<string | number>; message?: string }>,
  ) {
    super(message);
  }
}

export const fetchApi = async (path: string, options?: RequestInit) => {
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

export const uploadApi = {
  uploadUrl: '/api/storage/uploads',
  evidenceUploadUrl: '/api/storage/evidence/uploads',
};

export const editorialApi = {
  access: () =>
    fetchApi('/api/editorial/access') as Promise<{ data: EditorialAccess }>,

  list: (collection?: string, includeDrafts?: boolean) => {
    const params = new URLSearchParams();
    if (collection) params.set('collection', collection);
    if (includeDrafts) params.set('includeDrafts', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return fetchApi(`/api/editorial${qs}`) as Promise<{ data: EditorialItem[] }>;
  },

  get: (collection: string, slug: string, includeDrafts?: boolean) => {
    const params = new URLSearchParams();
    if (includeDrafts) params.set('includeDrafts', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return fetchApi(`/api/editorial/${collection}/${slug}${qs}`) as Promise<{ data: EditorialItem }>;
  },
  
  create: (item: Partial<EditorialItem>) => {
    return fetchApi(`/api/editorial`, {
      method: 'POST',
      body: JSON.stringify(item),
    }) as Promise<{ data: EditorialItem }>;
  },
  
  update: (id: string, expectedVersion: number, data: Partial<EditorialItem>) => {
    return fetchApi(`/api/editorial/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ expectedVersion, ...data }),
    }) as Promise<{ data: EditorialItem }>;
  },
  
  delete: (id: string, expectedVersion: number) => {
    return fetchApi(`/api/editorial/${id}?expectedVersion=${expectedVersion}`, {
      method: 'DELETE',
    });
  },
  
  reorder: (collection: string, items: { id: string; expectedVersion: number }[]) => {
    return fetchApi(`/api/editorial/reorder`, {
      method: 'POST',
      body: JSON.stringify({ collection, items }),
    });
  },

  generate: (payload: AiAutofillRequest) => {
    return fetchApi(`/api/editorial/generate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ data: AiAutofillResponse }>;
  },

  generateEventImage: (payload: { title: string; description?: string; location?: string; format?: string }) =>
    fetchApi('/api/editorial/generate-event-image', {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ data: { url: string; provenance: string } }>,

  generateCoverImage: (payload: { collection: string; title: string; description?: string }) =>
    fetchApi('/api/editorial/generate-cover-image', {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ data: { url: string; provenance: string } }>,

  markEnded: (id: string, expectedVersion: number) =>
    fetchApi(`/api/editorial/${id}/mark-ended`, {
      method: 'PATCH',
      body: JSON.stringify({ expectedVersion }),
    }) as Promise<{ data: EditorialItem }>,

  linkedInIngestionStatus: () =>
    fetchApi('/api/editorial/ingest/linkedin/status') as Promise<{ data: LinkedInIngestionStatus }>,

  runLinkedInIngestion: () =>
    fetchApi('/api/editorial/ingest/linkedin', {
      method: 'POST',
    }) as Promise<{ data: LinkedInIngestionReport }>,
};

export const editorialStaffApi = {
  list: () =>
    fetchApi('/api/editorial/staff') as Promise<{ data: EditorialStaffMember[] }>,
  add: (email: string, role: 'admin' | 'editor') =>
    fetchApi('/api/editorial/staff', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }) as Promise<{ data: EditorialStaffMember }>,
  changeRole: (id: string, role: 'admin' | 'editor') =>
    fetchApi(`/api/editorial/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }) as Promise<{ data: EditorialStaffMember }>,
  remove: (id: string) =>
    fetchApi(`/api/editorial/staff/${id}`, { method: 'DELETE' }),
};
