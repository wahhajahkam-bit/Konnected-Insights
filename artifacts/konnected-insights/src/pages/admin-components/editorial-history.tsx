import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ExternalLink, FileClock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError, fetchApi } from '@/lib/api';

type HistoryCategory = 'all' | '2030' | '2050' | '2100' | 'news' | 'programs';
type VersionKind = 'content' | 'programs' | 'news';

type Evidence = {
  url: string;
  title?: string;
  publisher?: string;
  excerpt?: string;
  authenticity?: string;
  publishedAt?: string | null;
  fetchedAt?: string | null;
  contentHash?: string;
};

type HistoricalVersion = {
  id: string;
  functionId: string;
  status: string;
  revision: number;
  previousVersionId?: string | null;
  updatedAt?: string;
  publishedAt?: string | null;
  lastVerifiedAt?: string | null;
  sources?: Evidence[];
  horizon?: number | string;
  lens?: string;
  title?: string;
  summary?: string;
  skills?: string[];
  organization?: string;
  programName?: string;
  description?: string;
  sourceUrl?: string;
  classification?: string;
  rationale?: string;
};

type EditorialDecision = {
  id: string;
  kind: VersionKind;
  versionId: string;
  action: string;
  actor: string;
  reason?: string | null;
  createdAt: string;
  version: HistoricalVersion;
};

type HistoryPage = {
  items: EditorialDecision[];
  nextCursor: string | null;
};

type VersionDetail = {
  version: HistoricalVersion;
  decisions: Array<Omit<EditorialDecision, 'version'>>;
};

type HistoryErrorContext = 'decisions' | 'earlier-decisions' | 'version';

export function editorialHistoryErrorMessage(error: unknown, context: HistoryErrorContext): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'Your editorial session has expired. Sign in again, then try again.';
    }
    if (error.status === 403) {
      return 'You do not have permission to view editorial history.';
    }
    if (error.status === 400) {
      return context === 'version'
        ? 'This historical version request is invalid.'
        : 'The history filters or cursor are invalid. Review the filters and try again.';
    }
    if (error.status === 404 && context === 'version') {
      return 'This historical version is no longer available.';
    }
  }

  if (context === 'version') {
    return 'This historical version is temporarily unavailable. Try again.';
  }
  if (context === 'earlier-decisions') {
    return 'Earlier decisions are temporarily unavailable. Try again.';
  }
  return 'Editorial decisions are temporarily unavailable. Try again.';
}

export function retryEditorialHistoryRequest(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && [400, 401, 403, 404].includes(error.status)) {
    return false;
  }
  return failureCount < 1;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}

function versionTitle(version: HistoricalVersion) {
  if (version.programName) return `${version.organization || 'Unknown organization'} — ${version.programName}`;
  return version.title || 'Untitled version';
}

function versionSummary(version: HistoricalVersion) {
  return version.description || version.summary || '';
}

function actionTone(action: string) {
  if (action === 'approve' || action === 'restore') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (action === 'reject' || action === 'unpublish') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-primary/30 bg-primary/10 text-primary';
}

async function getDecisionHistory(functionId: string, category: HistoryCategory, cursor?: string): Promise<HistoryPage> {
  const params = new URLSearchParams({ category, limit: '20' });
  if (functionId) params.set('functionId', functionId);
  if (cursor) params.set('cursor', cursor);
  const response = await fetchApi(`/api/editorial/future-work/history/decisions?${params}`) as { data: HistoryPage };
  return response.data;
}

async function getVersion(kind: VersionKind, id: string): Promise<VersionDetail> {
  const response = await fetchApi(`/api/editorial/future-work/history/versions/${kind}/${encodeURIComponent(id)}`) as { data: VersionDetail };
  return response.data;
}

function EvidenceList({ sources }: { sources?: Evidence[] }) {
  if (!sources?.length) {
    return <p className="flex gap-2 text-xs text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" />No retrievable evidence was attached to this version.</p>;
  }
  return <div className="space-y-2">
    {sources.map((source, index) => (
      <div key={`${source.contentHash || source.url}-${index}`} className="border border-border/60 bg-background/40 p-3 text-xs">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <a href={source.url} target="_blank" rel="noreferrer" className="break-all font-medium text-primary hover:underline">
            {source.publisher || source.title || source.url} <ExternalLink className="inline h-3 w-3" />
          </a>
          {source.authenticity && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{source.authenticity}</span>}
        </div>
        {source.title && source.title !== source.publisher && <p className="mt-1 text-muted-foreground">{source.title}</p>}
        {source.excerpt && <p className="mt-2 whitespace-pre-wrap border-l border-primary/40 pl-3 text-foreground/80">{source.excerpt}</p>}
        <p className="mt-2 text-[10px] text-muted-foreground">Published {formatDate(source.publishedAt)} · fetched {formatDate(source.fetchedAt)}</p>
      </div>
    ))}
  </div>;
}

function VersionBody({ version }: { version: HistoricalVersion }) {
  return <div className="space-y-4">
    <div>
      <div className="mb-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <span className="border border-border px-2 py-1">{version.status?.replaceAll('_', ' ') || 'unknown status'}</span>
        <span className="border border-border px-2 py-1">revision {version.revision}</span>
        {version.horizon && <span className="border border-border px-2 py-1">{version.horizon}{version.lens ? ` · ${version.lens} lens` : ''}</span>}
      </div>
      <h4 className="font-display text-xl">{versionTitle(version)}</h4>
      {versionSummary(version) && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{versionSummary(version)}</p>}
      {version.rationale && <p className="mt-2 text-xs"><strong>Classification rationale:</strong> {version.rationale}</p>}
      {version.skills?.length ? <p className="mt-2 text-xs"><strong>Skills:</strong> {version.skills.join(', ')}</p> : null}
    </div>
    <div>
      <h5 className="mb-2 text-xs font-medium uppercase tracking-widest">Evidence preserved with this version</h5>
      <EvidenceList sources={version.sources} />
    </div>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
      Updated {formatDate(version.updatedAt)} · last verified {formatDate(version.lastVerifiedAt)}
    </p>
  </div>;
}

function VersionLookup({
  target,
  onSelect,
  onClose,
}: {
  target: { kind: VersionKind; id: string };
  onSelect: (kind: VersionKind, id: string) => void;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ['admin-future-work', 'version-history', target.kind, target.id],
    queryFn: () => getVersion(target.kind, target.id),
    retry: retryEditorialHistoryRequest,
  });

  return <aside className="border border-primary/30 bg-card p-4 shadow-xl" data-testid="panel-history-version">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div><p className="text-[10px] uppercase tracking-widest text-primary">Direct version lookup</p><p className="break-all text-xs text-muted-foreground">{target.kind} / {target.id}</p></div>
      <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
    </div>
    {query.isLoading && <div className="flex min-h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
    {query.isError && <div role="alert" className="border border-destructive/30 bg-destructive/10 p-4 text-sm">
      <p>{editorialHistoryErrorMessage(query.error, 'version')}</p>
      <Button className="mt-3" size="sm" variant="outline" onClick={() => query.refetch()}>Try again</Button>
    </div>}
    {query.data && <div className="space-y-5">
      <VersionBody version={query.data.version} />
      {query.data.version.previousVersionId && <Button variant="outline" size="sm" onClick={() => onSelect(target.kind, query.data.version.previousVersionId!)}>
        <FileClock className="mr-2 h-4 w-4" />Open previous version
      </Button>}
      <section className="border-t border-border pt-4">
        <h5 className="mb-2 text-xs font-medium uppercase tracking-widest">Decisions for this version</h5>
        {!query.data.decisions.length && <p className="text-xs text-muted-foreground">No decisions were recorded for this version.</p>}
        {query.data.decisions.map(decision => <div key={decision.id} className="mb-2 border border-border/60 p-3 text-xs">
          <div className="flex flex-wrap justify-between gap-2"><strong>{decision.action.replaceAll('_', ' ')}</strong><span className="text-muted-foreground">{formatDate(decision.createdAt)}</span></div>
          <p className="mt-1 text-muted-foreground">{decision.actor}</p>
          {decision.reason && <p className="mt-2 whitespace-pre-wrap">{decision.reason}</p>}
        </div>)}
      </section>
    </div>}
  </aside>;
}

export function EditorialHistory({
  functionId,
  category,
  functionNames,
}: {
  functionId: string;
  category: HistoryCategory;
  functionNames: Record<string, string>;
}) {
  const [selectedVersion, setSelectedVersion] = useState<{ kind: VersionKind; id: string } | null>(null);
  const query = useInfiniteQuery({
    queryKey: ['admin-future-work', 'decision-history', functionId, category],
    queryFn: ({ pageParam }) => getDecisionHistory(functionId, category, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor || undefined,
    retry: retryEditorialHistoryRequest,
  });
  const decisions = query.data?.pages.flatMap(page => page.items) || [];
  // Background refresh failures also need recovery; only page failures use
  // the separate pagination alert below.
  const hasHistoryError = query.isError && !query.isFetchNextPageError;

  return <section className="space-y-4" aria-label="Editorial decision history">
    <div className="border border-primary/20 bg-primary/5 p-4">
      <h2 className="font-display text-2xl">Editorial decision timeline</h2>
      <p className="mt-1 text-xs text-muted-foreground">Filtered by the function and category selectors above. Lens does not filter decisions. Open any snapshot to retrieve its preserved evidence, including versions older than the main desk window.</p>
    </div>
    {selectedVersion && <VersionLookup target={selectedVersion} onSelect={(kind, id) => setSelectedVersion({ kind, id })} onClose={() => setSelectedVersion(null)} />}
    {query.isLoading && <div className="flex min-h-48 items-center justify-center border border-border" data-testid="status-decision-history-loading"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>}
    {hasHistoryError && <div role="alert" className="border border-destructive/30 bg-destructive/10 p-6 text-center" data-testid="status-decision-history-error">
      <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-destructive" />
      <p className="text-sm">{editorialHistoryErrorMessage(query.error, 'decisions')}</p>
      <Button className="mt-3" size="sm" variant="outline" onClick={() => query.refetch()}>Try again</Button>
    </div>}
    {!query.isLoading && !query.isError && !decisions.length && <div className="border border-dashed border-border p-10 text-center text-sm text-muted-foreground" data-testid="status-decision-history-empty">No editorial decisions match this function and category.</div>}
    {!!decisions.length && <ol className="relative ml-3 space-y-4 border-l border-border pl-6">
      {decisions.map(decision => <li key={decision.id} className="relative border border-border bg-card/60 p-4" data-testid={`decision-history-${decision.id}`}>
        <span className="absolute -left-[31px] top-5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <div className="mb-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
              <span className={`border px-2 py-1 ${actionTone(decision.action)}`}>{decision.action.replaceAll('_', ' ')}</span>
              <span className="border border-border px-2 py-1 text-muted-foreground">{decision.kind}</span>
              <span className="border border-border px-2 py-1 text-muted-foreground">{functionNames[decision.version.functionId] || 'Unassigned'}</span>
              {decision.version.horizon && <span className="border border-border px-2 py-1 text-muted-foreground">{decision.version.horizon}{decision.version.lens ? ` · ${decision.version.lens}` : ''}</span>}
            </div>
            <h3 className="font-display text-lg">{versionTitle(decision.version)}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{formatDate(decision.createdAt)} · {decision.actor} · revision {decision.version.revision}</p>
            {decision.reason && <p className="mt-3 whitespace-pre-wrap border-l border-primary/40 pl-3 text-sm">{decision.reason}</p>}
          </div>
          <Button className="shrink-0" size="sm" variant="outline" onClick={() => setSelectedVersion({ kind: decision.kind, id: decision.versionId })}>Inspect version & evidence</Button>
        </div>
      </li>)}
    </ol>}
    {query.hasNextPage && !query.isFetchNextPageError && <div className="flex justify-center">
      <Button variant="outline" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} data-testid="button-decision-history-earlier">
        {query.isFetchingNextPage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronDown className="mr-2 h-4 w-4" />}Load earlier decisions
      </Button>
    </div>}
    {query.isFetchNextPageError && <div role="alert" className="border border-destructive/30 bg-destructive/10 p-3 text-center text-xs" data-testid="status-decision-history-earlier-error">
      {editorialHistoryErrorMessage(query.error, 'earlier-decisions')} <Button className="ml-2" size="sm" variant="outline" onClick={() => query.fetchNextPage()}>Retry</Button>
    </div>}
  </section>;
}