import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import { Link } from 'wouter';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Clock3,
  ExternalLink,
  FileClock,
  History,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Navbar } from '@/components/navbar';
import { ResearchRejections } from '@/components/research-rejections';
import { Metadata } from '@/components/metadata';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/api';
import { FunctionPresentationFields, type FunctionPresentation } from './admin-components/function-presentation';
import { EditorialHistory } from './admin-components/editorial-history';
import { ResearchSourcePreflight } from './admin-components/research-source-preflight';
import { matchesResearchFilter } from './admin-components/research-history-filter';
import {
  adminFutureWorkApi,
  futureWorkErrorMessage,
  type AdminFutureWorkData,
  type FutureWorkContent,
  type FutureWorkFunction,
  type FutureWorkNews,
  type FutureWorkProgram,
  type FutureWorkResearchSources,
  type FutureWorkSchedule,
  type ReviewAction,
  type ReviewKind,
} from '@/lib/admin-future-work-api';

const queryKey = ['admin-future-work'] as const;
type ReviewItem = FutureWorkContent | FutureWorkProgram | FutureWorkNews;

function isEligibleResearchUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && !url.username
      && !url.password
      && value === value.trim()
      && value.length <= 2048;
  } catch {
    return false;
  }
}

function ResearchSourcesFields({ value, onChange }: {
  value: FutureWorkResearchSources;
  onChange: (value: FutureWorkResearchSources) => void;
}) {
  const setUrl = (index: number, url: string) => {
    const urls = [...value.urls];
    urls[index] = url;
    onChange({ ...value, urls });
  };
  return (
    <fieldset className="space-y-4 border-t border-border pt-4" data-testid="research-sources-fields">
      <legend className="px-1 font-medium">Research sources · optional</legend>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Add a publisher or institution root URL to let research discover relevant material across that site. Use a specific article, report, or program URL when that exact page should be evaluated. These URLs and instructions are private research metadata and never appear on the public function page.
      </p>
      <div className="border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
        A supplied URL is guidance, not automatic evidence. Pages still must be public, retrievable, relevant, attributable, and meet publication-date and evidence eligibility rules; adding a source does not guarantee publication.
      </div>
      <div className="space-y-3">
        {value.urls.map((url, index) => {
          const invalid = !!url && !isEligibleResearchUrl(url);
          return <div key={index}>
            <Label htmlFor={`research-source-url-${index}`}>Source URL {index + 1}</Label>
            <div className="mt-1 flex gap-2">
              <Input
                id={`research-source-url-${index}`}
                type="url"
                maxLength={2048}
                placeholder="https://publisher.org or a specific public page"
                value={url}
                aria-invalid={invalid}
                onChange={event => setUrl(index, event.target.value)}
                data-testid={`input-research-source-${index}`}
              />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove source URL ${index + 1}`} onClick={() => onChange({ ...value, urls: value.urls.filter((_, itemIndex) => itemIndex !== index) })}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {invalid && <p className="mt-1 text-xs text-destructive">Enter a complete public http or https URL (maximum 2,048 characters).</p>}
          </div>;
        })}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={value.urls.length >= 10} onClick={() => onChange({ ...value, urls: [...value.urls, ''] })} data-testid="button-add-research-source">
            <Plus className="mr-2 h-4 w-4" />Add source URL
          </Button>
          {(value.urls.length > 0 || value.instructions) && <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ urls: [], instructions: '' })} data-testid="button-clear-research-sources">Clear sources and instructions</Button>}
        </div>
        <p className="text-xs text-muted-foreground">{value.urls.length} / 10 URLs</p>
      </div>
      <div>
        <Label htmlFor="research-source-instructions">Research instructions</Label>
        <Textarea
          id="research-source-instructions"
          rows={5}
          maxLength={4000}
          placeholder="Optional guidance on what to look for or how these sources should be used."
          value={value.instructions}
          onChange={event => onChange({ ...value, instructions: event.target.value })}
          data-testid="input-research-source-instructions"
        />
        <p className="mt-1 text-xs text-muted-foreground">{value.instructions.length.toLocaleString()} / 4,000 characters</p>
      </div>
    </fieldset>
  );
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function itemTitle(item: ReviewItem) {
  return 'programName' in item ? `${item.organization} — ${item.programName}` : item.title;
}

function itemSummary(item: ReviewItem) {
  return 'description' in item ? item.description : item.summary || '';
}

function itemKind(item: ReviewItem): ReviewKind {
  if ('programName' in item) return 'programs';
  if ('horizon' in item) return 'content';
  return 'news';
}

function statusTone(status: string) {
  if (status === 'published') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'flagged') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  if (status === 'rejected') return 'border-destructive/30 bg-destructive/10 text-destructive';
  return 'border-primary/30 bg-primary/10 text-primary';
}

function EvidenceList({ item }: { item: ReviewItem }) {
  if (!item.sources?.length) {
    return <p className="text-xs text-amber-300 flex gap-2"><AlertTriangle className="h-4 w-4" />No retrievable evidence is attached.</p>;
  }
  return (
    <div className="space-y-2">
      {item.sources.map((source, index) => (
        <div key={`${source.contentHash}-${index}`} className="border border-border/60 bg-background/40 p-3 text-xs" data-testid={`evidence-${item.id}-${index}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <a href={source.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline" data-testid={`link-evidence-${item.id}-${index}`}>
              {source.publisher || source.title} <ExternalLink className="inline h-3 w-3" />
            </a>
            <span className="uppercase tracking-wider text-[10px] text-muted-foreground">{source.authenticity || 'Unrated authenticity'}</span>
          </div>
          <p className="mt-1 text-muted-foreground">{source.title}</p>
          {source.excerpt && <p className="mt-2 border-l border-primary/40 pl-3 text-foreground/80">{source.excerpt}</p>}
          <p className="mt-2 text-[10px] text-muted-foreground">
            Published {formatDate(source.publishedAt)} · fetched {formatDate(source.fetchedAt)}
          </p>
        </div>
      ))}
    </div>
  );
}

function RunResearchSources({ sources }: { sources?: FutureWorkResearchSources | null }) {
  if (!sources || (!sources.urls?.length && !sources.instructions)) return null;
  return <div className="mt-2 border border-border/60 bg-background/30 p-2 text-xs" data-testid="research-source-snapshot">
    <p className="mb-1 font-medium">Private research source guidance snapshot</p>
    {sources.urls?.map(url => <a key={url} href={url} target="_blank" rel="noreferrer" className="block break-all text-primary hover:underline">{url}</a>)}
    {sources.instructions && <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">Instructions: {sources.instructions}</p>}
  </div>;
}

function VersionComparison({ item, all }: { item: ReviewItem; all: ReviewItem[] }) {
  const previous = item.previousVersionId ? all.find(candidate => candidate.id === item.previousVersionId) : undefined;
  if (!previous) return <p className="text-xs text-muted-foreground">No prior version is linked. This proposal will create the first approved version.</p>;
  const changedTitle = itemTitle(item) !== itemTitle(previous);
  const changedSummary = itemSummary(item) !== itemSummary(previous);
  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid={`comparison-${item.id}`}>
      <div className="border border-border/60 p-3">
        <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Approved predecessor · r{previous.revision}</p>
        <p className="text-sm font-medium">{itemTitle(previous)}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{itemSummary(previous)}</p>
      </div>
      <div className="border border-primary/30 bg-primary/5 p-3">
        <p className="mb-2 text-[10px] uppercase tracking-widest text-primary">Candidate · r{item.revision}</p>
        <p className={`text-sm font-medium ${changedTitle ? 'bg-amber-400/10' : ''}`}>{itemTitle(item)}</p>
        <p className={`mt-2 text-xs leading-relaxed ${changedSummary ? 'bg-amber-400/10' : 'text-muted-foreground'}`}>{itemSummary(item)}</p>
      </div>
    </div>
  );
}

function ReviewCard({
  item,
  all,
  functionName,
  busy,
  onAction,
  onEdit,
  rejection,
}: {
  item: ReviewItem;
  all: ReviewItem[];
  functionName: string;
  busy: boolean;
  onAction: (item: ReviewItem, action: ReviewAction) => void;
  onEdit: (item: ReviewItem) => void;
  rejection?: { reason: string; actor: string; createdAt: string };
}) {
  const isCandidate = item.status === 'pending_review' || item.status === 'flagged';
  return (
    <article className="border border-border bg-card/60 shadow-xl" data-testid={`card-review-${item.id}`}>
      <div className="flex flex-col gap-3 border-b border-border/60 p-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
            <span className={`border px-2 py-1 ${statusTone(item.status)}`} data-testid={`status-review-${item.id}`}>{item.status.replace('_', ' ')}</span>
            <span className="border border-border px-2 py-1 text-muted-foreground">{functionName}</span>
            {'horizon' in item && <span className="border border-border px-2 py-1 text-muted-foreground">{item.horizon} · {item.lens} lens</span>}
            {item.stale && <span className="border border-amber-500/30 px-2 py-1 text-amber-300">Stale</span>}
          </div>
          <h3 className="font-display text-xl">{itemTitle(item)}</h3>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">{itemSummary(item)}</p>
          {'rationale' in item && item.rationale && <p className="mt-2 text-xs text-foreground/80"><strong>Classification rationale:</strong> {item.rationale}</p>}
        </div>
        <p className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">r{item.revision} · {formatDate(item.updatedAt)}</p>
      </div>
      <div className="space-y-4 p-4">
        {item.status === 'rejected' && <section className="border border-amber-500/30 bg-amber-500/5 p-3" aria-label="Rejection reason">
          <h4 className="text-sm font-medium">Why this research was rejected</h4>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{rejection?.reason?.trim() || 'No editorial rejection reason was recorded for this older version.'}</p>
          {rejection && <p className="mt-2 text-xs text-muted-foreground">{formatDate(rejection.createdAt)} · {rejection.actor}</p>}
        </section>}
        <VersionComparison item={item} all={all} />
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-widest">Source evidence</h4>
          <EvidenceList item={item} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <p className="text-xs text-muted-foreground">Last verified: {formatDate(item.lastVerifiedAt)}</p>
          <div className="flex flex-wrap gap-2">
            {isCandidate && <>
              <Button size="sm" onClick={() => onAction(item, 'approve')} disabled={busy} data-testid={`button-approve-${item.id}`}><Check className="mr-1.5 h-4 w-4" />Approve</Button>
              <Button size="sm" variant="outline" onClick={() => onEdit(item)} disabled={busy} data-testid={`button-edit-${item.id}`}><Pencil className="mr-1.5 h-4 w-4" />Edit proposal</Button>
              <Button size="sm" variant="destructive" onClick={() => onAction(item, 'reject')} disabled={busy} data-testid={`button-reject-${item.id}`}><X className="mr-1.5 h-4 w-4" />Reject</Button>
            </>}
            {item.status === 'published' && <>
              <Button size="sm" variant="outline" onClick={() => onEdit(item)} disabled={busy} data-testid={`button-edit-${item.id}`}><Pencil className="mr-1.5 h-4 w-4" />Create edited version</Button>
              <Button size="sm" variant="outline" onClick={() => onAction(item, 'unpublish')} disabled={busy} data-testid={`button-unpublish-${item.id}`}><Pause className="mr-1.5 h-4 w-4" />Unpublish</Button></>}
            {item.status === 'unpublished' &&
              <Button size="sm" variant="outline" onClick={() => onAction(item, 'restore')} disabled={busy} data-testid={`button-restore-${item.id}`}><RotateCcw className="mr-1.5 h-4 w-4" />Restore approved version</Button>}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function AdminFutureWork() {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editItem, setEditItem] = useState<ReviewItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editSkills, setEditSkills] = useState('');
  const [reason, setReason] = useState('');
  const [functionDialog, setFunctionDialog] = useState<FutureWorkFunction | 'new' | null>(null);
  const [functionDraft, setFunctionDraft] = useState<{ name: string; slug: string; description: string; presentation?: FunctionPresentation; researchSources: FutureWorkResearchSources }>({ name: '', slug: '', description: '', researchSources: { urls: [], instructions: '' } });
  const [selectedFunction, setSelectedFunction] = useState('');
  const [category, setCategory] = useState('all');
  const [lens, setLens] = useState('all');
  const [tab, setTab] = useState('functions');
  const [previewHorizon, setPreviewHorizon] = useState('2030');

  const query = useQuery({
    queryKey,
    queryFn: adminFutureWorkApi.get,
    staleTime: 10_000,
    refetchInterval: ({ state }) => {
      const data = state.data as AdminFutureWorkData | undefined;
      return data?.runs.some(run => run.status === 'running' || run.status === 'queued') ? 4_000 : 30_000;
    },
    refetchOnWindowFocus: true,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['future-work'] }),
    ]);
  };
  const mutationOptions = {
    onSuccess: async () => {
      await refresh();
      toast({ title: 'Saved', description: 'The research desk has been refreshed.' });
    },
    onError: async (error: unknown) => {
      await refresh();
      if (error instanceof ApiError && error.status === 409) {
        setFunctionDialog(null);
        setEditItem(null);
      }
      toast({ variant: 'destructive' as const, title: 'Could not save', description: futureWorkErrorMessage(error) });
    },
  };
  const reviewMutation = useMutation({ mutationFn: ({ kind, id, action, revision, reasonText, changes }: {
    kind: ReviewKind; id: string; action: ReviewAction; revision: number; reasonText?: string; changes?: Record<string, string | string[]>;
  }) => adminFutureWorkApi.review(kind, id, { action, revision, reason: reasonText, changes }), ...mutationOptions });
  const functionMutation = useMutation({
    mutationFn: async ({ current, values }: { current: FutureWorkFunction | null; values: typeof functionDraft }) => {
      const researchSources = values.researchSources.urls.length || values.researchSources.instructions
        ? values.researchSources
        : null;
      if (current) return adminFutureWorkApi.updateFunction(current.id, { revision: current.revision, ...values, researchSources });
      return adminFutureWorkApi.createFunction({ ...values, researchSources, sortOrder: (query.data?.functions.length || 0) + 1, enabled: true });
    },
    ...mutationOptions,
  });
  const functionUpdate = useMutation({ mutationFn: ({ id, ...data }: Partial<FutureWorkFunction> & { id: string; revision: number }) => adminFutureWorkApi.updateFunction(id, data), ...mutationOptions });
  const scheduleMutation = useMutation({ mutationFn: ({ id, ...data }: {
    id: FutureWorkSchedule['id'];
    revision: number;
    enabled?: boolean;
    sourceWindowMonths?: number;
    staleAfterDays?: number;
    verificationOnlyOptIn?: boolean;
  }) => adminFutureWorkApi.updateSchedule(id, data), ...mutationOptions });
  const runMutation = useMutation({ mutationFn: (id: FutureWorkSchedule['id']) => adminFutureWorkApi.run(id, 4), ...mutationOptions });

  const data = query.data;
  const allItems = useMemo<ReviewItem[]>(() => data ? [...data.content, ...data.programs, ...data.news] : [], [data]);
  const scopedItems = allItems.filter(item => (!selectedFunction || item.functionId === selectedFunction)
    && (category === 'all' || ('horizon' in item ? String(item.horizon) === category : itemKind(item) === category))
    && (lens === 'all' || ('lens' in item && item.lens === lens)));
  const pending = scopedItems.filter(item => item.status === 'pending_review');
  const flagged = scopedItems.filter(item => item.status === 'flagged' || item.stale);
  const history = scopedItems.filter(item => item.status !== 'pending_review' && item.status !== 'flagged')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const functionName = (id: string) => data?.functions.find(item => item.id === id)?.name || 'Unassigned';
  const functionNames = useMemo(() => Object.fromEntries((data?.functions || []).map(item => [item.id, item.name])), [data?.functions]);
  const scopedRuns = data?.runs.filter(run => (!selectedFunction && category === 'all') || run.results?.some(result => matchesResearchFilter(result, selectedFunction, category))) || [];

  const act = (item: ReviewItem, action: ReviewAction) => {
    const destructive = action === 'reject' || action === 'unpublish';
    const reasonText = destructive ? window.prompt(`Reason for ${action}:`) || undefined : undefined;
    if (destructive && !reasonText) return;
    reviewMutation.mutate({ kind: itemKind(item), id: item.id, action, revision: item.revision, reasonText });
  };

  const openEdit = (item: ReviewItem) => {
    setEditItem(item);
    setEditTitle(itemTitle(item));
    setEditSummary(itemSummary(item));
    setEditSkills('skills' in item ? item.skills.join(', ') : '');
    setReason('');
  };

  const openFunction = (item: FutureWorkFunction | 'new') => {
    setFunctionDialog(item);
    setFunctionDraft(item === 'new'
      ? { name: '', slug: '', description: '', presentation: {}, researchSources: { urls: [], instructions: '' } }
      : { name: item.name, slug: item.slug, description: item.description || '', presentation: item.presentation || {}, researchSources: item.researchSources || { urls: [], instructions: '' } });
  };

  const editIsProgram = !!editItem && 'programName' in editItem;
  const editSummaryIsValid = editIsProgram
    ? editSummary.trim().length >= 1 && editSummary.trim().length <= 500
    : editSummary.trim().length >= 1 && editSummary.trim().length <= 2000;
  const editTitleIsValid = editIsProgram
    ? editTitle.trim().length >= 1 && editTitle.trim().length <= 451
    : editTitle.trim().length >= 1 && editTitle.trim().length <= 250;
  const parsedSkills = editSkills.split(',').map(skill => skill.trim()).filter(Boolean);
  const editSkillsAreValid = !editItem || !('skills' in editItem) ||
    (parsedSkills.length <= 12 && parsedSkills.every(skill => skill.length >= 1 && skill.length <= 120));
  const researchSourcesAreValid = functionDraft.researchSources.urls.length <= 10
    && functionDraft.researchSources.urls.every(url => isEligibleResearchUrl(url))
    && functionDraft.researchSources.instructions.length <= 4000;

  const moveFunction = (item: FutureWorkFunction, direction: -1 | 1) => {
    if (!data) return;
    const ordered = [...data.functions].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex(entry => entry.id === item.id);
    const other = ordered[index + direction];
    if (!other) return;
    Promise.all([
      adminFutureWorkApi.updateFunction(item.id, { revision: item.revision, sortOrder: other.sortOrder }),
      adminFutureWorkApi.updateFunction(other.id, { revision: other.revision, sortOrder: item.sortOrder }),
    ]).then(refresh).catch(async error => {
      await refresh();
      toast({ variant: 'destructive', title: 'Could not reorder', description: futureWorkErrorMessage(error) });
    });
  };

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <Metadata title="Future of Work Research Desk" />
      <div className="noise-overlay" />
      <Navbar alwaysDark />
      <main className="container mx-auto max-w-screen-2xl px-4 pb-16 pt-24 md:px-6">
        <header className="mb-6 border border-primary/20 bg-primary/5 p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 h-5 w-5 text-primary" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-primary">Secured staff workspace</p>
                <h1 className="mt-1 font-display text-3xl">Future of Work Research Desk</h1>
                <p className="mt-1 text-sm text-muted-foreground">{user?.primaryEmailAddress?.emailAddress || 'Authenticated staff member'} · Supported automated findings publish without per-item approval. Manual edits create pending versions for review.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="default" size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Link href="/admin/research" data-testid="link-admin-research-engine">
                  <Play className="mr-2 h-4 w-4" /> Research Engine
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm"><Link href="/admin" data-testid="link-admin-desk"><ArrowLeft className="mr-2 h-4 w-4" />Editorial desk</Link></Button>
              <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching} data-testid="button-refresh-future-work">
                <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />Refresh
              </Button>
            </div>
          </div>
        </header>

        {query.isLoading && <div className="flex min-h-80 items-center justify-center" data-testid="status-future-work-loading"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
        {query.error && (
          <div className="border border-destructive/30 bg-destructive/10 p-8 text-center" data-testid="status-future-work-error">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
            <p className="font-medium">The research desk could not be loaded.</p>
            <p className="mt-1 text-sm text-muted-foreground">{futureWorkErrorMessage(query.error)}</p>
            <Button className="mt-4" onClick={() => query.refetch()}>Try again</Button>
          </div>
        )}

        {data && <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Pending review', count: pending.length, Icon: FileClock },
              { label: 'Flagged / stale', count: flagged.length, Icon: AlertTriangle },
              { label: 'Overdue sections', count: data.freshness.overdueCount, Icon: Clock3 },
              { label: 'Research runs', count: data.runs.length, Icon: History },
            ].map(({ label, count, Icon }) => (
              <div key={label} className="border border-border bg-card/50 p-4" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>
                <Icon className="mb-3 h-4 w-4 text-primary" />
                <p className="text-2xl font-display">{count}</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <section className="mb-5 grid gap-4 border border-border bg-card/50 p-4 md:grid-cols-3" aria-label="Function and editorial filters">
            <div><Label htmlFor="desk-function">1. Choose function</Label><select id="desk-function" className="mt-1 w-full rounded border border-border bg-background p-2 text-sm" value={selectedFunction} onChange={event => setSelectedFunction(event.target.value)}>
              <option value="">All functions</option>{data.functions.map(item => <option key={item.id} value={item.id}>{item.name}{item.enabled ? '' : ' (inactive)'}</option>)}
            </select></div>
            <div><Label htmlFor="desk-category">2. Horizon / category</Label><select id="desk-category" className="mt-1 w-full rounded border border-border bg-background p-2 text-sm" value={category} onChange={event => { setCategory(event.target.value); setLens('all'); if (['2030', '2050', '2100'].includes(event.target.value)) setPreviewHorizon(event.target.value); }}>
              <option value="all">All categories</option><option value="news">01 · Recent news</option><option value="programs">02 · Recommended programs</option><option value="2030">03 · Outlook · 2030</option><option value="2050">03 · Outlook · 2050</option><option value="2100">03 · Outlook · 2100 speculative scenarios</option>
            </select></div>
            <div><Label htmlFor="desk-lens">Lens · horizon content only</Label><select id="desk-lens" className="mt-1 w-full rounded border border-border bg-background p-2 text-sm" value={lens} disabled={category === 'news' || category === 'programs'} onChange={event => setLens(event.target.value)}>
              <option value="all">Both lenses / all content</option><option value="technology">Technology</option><option value="field">Field</option>
            </select></div>
          </section>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-5 h-auto flex-wrap justify-start bg-card/60">
              <TabsTrigger value="functions" data-testid="tab-functions">Functions</TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-pending">Pending ({pending.length})</TabsTrigger>
              <TabsTrigger value="flagged" data-testid="tab-flagged">Flagged ({flagged.length})</TabsTrigger>
              <TabsTrigger value="schedules" data-testid="tab-schedules">Schedules</TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
            </TabsList>

            {(['pending', 'flagged', 'history'] as const).map(tab => {
              const items = tab === 'pending' ? pending : tab === 'flagged' ? flagged : history;
              return <TabsContent key={tab} value={tab} className="space-y-4">
                {tab === 'history' && (
                  <>
                    <EditorialHistory functionId={selectedFunction} category={category as 'all' | '2030' | '2050' | '2100' | 'news' | 'programs'} functionNames={functionNames} />
                    <div className="mb-6 flex items-center justify-between border border-primary/20 bg-primary/5 p-4">
                      <div>
                        <h3 className="font-medium">Run automated research</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Supported automated findings publish without per-item approval. Inspect all outcomes and source rejections in the Research Engine.</p>
                      </div>
                      <Button asChild size="sm">
                        <Link href="/admin/research" data-testid="button-research-from-history">Go to Research Engine</Link>
                      </Button>
                    </div>
                    {!!items.length && <h2 className="pt-2 font-display text-2xl">Current version records</h2>}
                  </>
                )}
                {!items.length && tab !== 'history' && <div className="border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No {tab} records.</div>}
                {!items.length && tab === 'history' && <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No current version records match these filters. The complete decision timeline remains available above.</div>}
                {items.map(item => <ReviewCard key={`${tab}-${item.id}`} item={item} all={allItems} functionName={functionName(item.functionId)} busy={reviewMutation.isPending} onAction={act} onEdit={openEdit} rejection={data.decisions?.find(decision => decision.versionId === item.id && decision.action === 'reject')} />)}
              </TabsContent>;
            })}

            <TabsContent value="functions">
              <div className="mb-4 flex items-center justify-between">
                <div><h2 className="font-display text-2xl">Business functions</h2><p className="text-sm text-muted-foreground">Order controls the public presentation. Deactivation preserves all version history.</p></div>
                <Button onClick={() => openFunction('new')} data-testid="button-add-function"><Plus className="mr-2 h-4 w-4" />Add function</Button>
              </div>
              <div className="space-y-2">
                {[...data.functions].sort((a, b) => a.sortOrder - b.sortOrder).map((item, index, ordered) => (!selectedFunction || selectedFunction === item.id) && (
                  <div key={item.id} className={`flex flex-col gap-3 border border-border bg-card/50 p-4 sm:flex-row sm:items-center ${!item.enabled ? 'opacity-60' : ''}`} data-testid={`row-function-${item.id}`}>
                    <div className="flex gap-1">
                      <Button aria-label={`Move ${item.name} up`} variant="ghost" size="icon" disabled={index === 0} onClick={() => moveFunction(item, -1)} data-testid={`button-function-up-${item.id}`}><ArrowUp className="h-4 w-4" /></Button>
                      <Button aria-label={`Move ${item.name} down`} variant="ghost" size="icon" disabled={index === ordered.length - 1} onClick={() => moveFunction(item, 1)} data-testid={`button-function-down-${item.id}`}><ArrowDown className="h-4 w-4" /></Button>
                    </div>
                    <div className="min-w-0 flex-1"><p className="font-medium">{item.name}</p><p className="truncate text-xs text-muted-foreground">/{item.slug} · {item.description || 'No description'}</p></div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedFunction(item.id); openFunction(item); }} data-testid={`button-function-edit-${item.id}`}><Pencil className="mr-2 h-4 w-4" />Page presentation</Button>
                      <Button variant="outline" size="sm" onClick={() => { setSelectedFunction(item.id); setTab('history'); }}>Horizon / lens content</Button>
                      <Button asChild variant="ghost" size="sm"><a href={`/future-of-work/${item.slug}?horizon=${previewHorizon}`} target="_blank" rel="noreferrer">Preview {previewHorizon}<ExternalLink className="ml-2 h-3 w-3" /></a></Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={item.enabled} onCheckedChange={enabled => functionUpdate.mutate({ id: item.id, revision: item.revision, enabled })} disabled={functionUpdate.isPending} data-testid={`switch-function-${item.id}`} />
                      <span className="w-14 text-xs uppercase tracking-wider text-muted-foreground">{item.enabled ? 'Active' : 'Inactive'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="schedules" className="space-y-6">
              <div><h2 className="font-display text-2xl">Research schedules</h2><p className="text-sm text-muted-foreground">Source publication windows and stale thresholds are intentionally separate. Manual runs are bounded to four combinations.</p></div>
              <div className="grid gap-4 lg:grid-cols-2">
                {data.schedules.map(schedule => {
                  const running = data.runs.some(run => run.scheduleId === schedule.id && (run.status === 'running' || run.status === 'queued'));
                  return <ScheduleCard key={schedule.id} schedule={schedule} running={running} saving={scheduleMutation.isPending || runMutation.isPending} onSave={values => scheduleMutation.mutate({ id: schedule.id, revision: schedule.revision, ...values })} onRun={() => runMutation.mutate(schedule.id)} />;
                })}
              </div>
              <div>
                <h2 className="mb-3 font-display text-2xl">Run history</h2>
                <div className="overflow-x-auto border border-border">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="bg-card text-[10px] uppercase tracking-widest text-muted-foreground"><tr><th className="p-3">Schedule</th><th className="p-3">Status</th><th className="p-3">Started</th><th className="p-3">Processed</th><th className="p-3">Sources found / accepted / rejected</th><th className="p-3">Errors & usage</th></tr></thead>
                    <tbody>{scopedRuns.map(run => <tr key={run.id} className="border-t border-border" data-testid={`row-run-${run.id}`}>
                      <td className="p-3 font-medium">{run.scheduleId}</td><td className="p-3">{run.status}</td><td className="p-3 text-muted-foreground">{formatDate(run.startedAt)}</td><td className="p-3">{run.processed}</td>
                      <td className="p-3 min-w-[320px]">
                        {run.sourcesFound} / {run.sourcesAccepted} / {run.sourcesRejected}
                         {!!run.plan?.length && <details className="mt-2 text-xs" open={run.status === 'running' || run.status === 'queued'}>
                           <summary>Plan and source guidance ({run.plan.length})</summary>
                           <p className="my-2 text-muted-foreground">Recorded before results, including while this run is queued or running.</p>
                           {run.plan.map((item, planIndex) => <div key={planIndex} className="my-2 border-t border-border/50 pt-2">
                             <p>{item.name || item.functionId || 'Planned function'} · {item.kind === 'content' ? `${item.horizon} · ${item.lens || 'all lenses'}` : item.kind}</p>
                             <RunResearchSources sources={item.researchSources} />
                           </div>)}
                         </details>}
                         {(run.status === 'running' || run.status === 'queued') && !run.results?.length && <p className="mt-2 text-xs text-muted-foreground">Running before results. Attempts and rejections will remain visible as they arrive.</p>}
                        {run.results?.filter(result => matchesResearchFilter(result, selectedFunction, category)).map((result, index) => typeof result === 'string' ? <p key={index} className="mt-2 text-xs">{result}</p> : <div key={index} className="mt-3">
                          <p className="text-xs font-medium">{result.combination.name} · {result.combination.kind === 'content' ? `${result.combination.horizon} · ${result.combination.lens}` : result.combination.kind}</p>
                          <p className="mt-1 text-xs">{result.outcome?.replaceAll('_', ' ')} · {result.result}</p>
                          {result.searchQuery && <p className="mt-1 break-words text-xs">Query: {result.searchQuery}</p>}
                           <RunResearchSources sources={result.combination.researchSources} />
                          {!!result.attempts?.length && <details className="mt-2 text-xs"><summary>Search attempts</summary>{result.attempts.map((attempt, attemptIndex) => <div key={attemptIndex} className="my-2 break-words"><p>{attempt.searchQuery}</p>{attempt.urls.map(url => <a key={url} className="block text-primary hover:underline" href={url} target="_blank" rel="noreferrer">{url}</a>)}</div>)}</details>}
                          {!!result.rejected?.length && <ResearchRejections sources={result.rejected} />}
                        </div>)}
                        {run.sourcesRejected > 0 && !run.results?.some(result => typeof result !== 'string' && result.rejected?.length) && <p className="mt-2 text-xs text-muted-foreground">No source rejection reasons were recorded in this older run.</p>}
                      </td>
                      <td className="max-w-sm p-3 text-xs text-muted-foreground">{run.errors?.length ? run.errors.join('; ') : run.usage ? JSON.stringify(run.usage) : 'None reported'}</td>
                    </tr>)}</tbody>
                  </table>
                  {!scopedRuns.length && <p className="p-8 text-center text-sm text-muted-foreground">No runs match these filters. Older unclassified runs appear under All.</p>}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>}
      </main>

      <Dialog open={!!editItem} onOpenChange={open => !open && setEditItem(null)}>
        <DialogContent className="max-w-2xl bg-card">
          <DialogHeader><DialogTitle>Edit as a new pending version</DialogTitle><DialogDescription>The approved version is never overwritten. These changes return to the review queue.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label htmlFor="future-edit-title">{editItem && 'programName' in editItem ? 'Organization — program name' : 'Title'}</Label><Input id="future-edit-title" maxLength={editIsProgram ? 451 : 250} value={editTitle} onChange={event => setEditTitle(event.target.value)} aria-invalid={!editTitleIsValid} data-testid="input-edit-title" />{editIsProgram && <p className="mt-1 text-xs text-muted-foreground">Use “Organization — program name” so both required fields are preserved.</p>}</div>
            <div><Label htmlFor="future-edit-summary">{editItem && 'programName' in editItem ? 'Description' : 'Summary'}</Label><Textarea id="future-edit-summary" rows={8} minLength={1} maxLength={editIsProgram ? 500 : 2000} value={editSummary} onChange={event => setEditSummary(event.target.value)} aria-invalid={!editSummaryIsValid} data-testid="input-edit-summary" /><p className={`mt-1 text-xs ${editSummaryIsValid ? 'text-muted-foreground' : 'text-destructive'}`} data-testid="text-edit-summary-count">{editSummary.trim().length} / {editIsProgram ? '500' : '2,000'} characters</p></div>
            {editItem && 'skills' in editItem && <div><Label htmlFor="future-edit-skills">Shared future skills (comma separated)</Label><Input id="future-edit-skills" value={editSkills} onChange={event => setEditSkills(event.target.value)} aria-invalid={!editSkillsAreValid} data-testid="input-edit-skills" /><p className={`mt-1 text-xs ${editSkillsAreValid ? 'text-muted-foreground' : 'text-destructive'}`}>Approved 2030 skills also drive the connected career profile. Up to 12 skills, 1–120 characters each.</p></div>}
            <div><Label htmlFor="future-edit-reason">Editorial note</Label><Input id="future-edit-reason" maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} data-testid="input-edit-reason" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button disabled={!editItem || !editTitleIsValid || !editSummaryIsValid || !editSkillsAreValid || reviewMutation.isPending} onClick={() => {
              if (!editItem) return;
              const changes: Record<string, string | string[]> = 'programName' in editItem
                ? { organization: editTitle.split('—')[0]?.trim() || editItem.organization, programName: editTitle.split('—').slice(1).join('—').trim() || editItem.programName, description: editSummary }
                : { title: editTitle.trim(), summary: editSummary.trim(), ...('skills' in editItem ? { skills: parsedSkills } : {}) };
              reviewMutation.mutate({ kind: itemKind(editItem), id: editItem.id, action: 'edit', revision: editItem.revision, reasonText: reason || undefined, changes }, { onSuccess: () => setEditItem(null) });
            }} data-testid="button-save-edit"><Save className="mr-2 h-4 w-4" />Create pending version</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!functionDialog} onOpenChange={open => !open && setFunctionDialog(null)}>
        <DialogContent className="bg-card max-h-[90vh] overflow-y-auto max-w-2xl">
          <DialogHeader><DialogTitle>{functionDialog === 'new' ? 'Add business function' : 'Edit business function'}</DialogTitle><DialogDescription>Slugs are public identifiers. Presentation fields control the public layout.</DialogDescription></DialogHeader>
          <div className="min-w-0 space-y-6">
            <div className="space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground border-b border-border/50 pb-2">Basic Info</h4>
              <div><Label htmlFor="function-name">Name</Label><Input id="function-name" value={functionDraft.name} onChange={event => setFunctionDraft(value => ({ ...value, name: event.target.value }))} data-testid="input-function-name" /></div>
              <div><Label htmlFor="function-slug">Slug</Label><Input id="function-slug" value={functionDraft.slug} onChange={event => setFunctionDraft(value => ({ ...value, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} data-testid="input-function-slug" /></div>
              <div><Label htmlFor="function-description">Description</Label><Textarea id="function-description" value={functionDraft.description} onChange={event => setFunctionDraft(value => ({ ...value, description: event.target.value }))} data-testid="input-function-description" /></div>
            </div>

            <FunctionPresentationFields value={functionDraft.presentation || {}} functionDetails={functionDraft} onChange={presentation => setFunctionDraft(value => ({ ...value, presentation }))} />
            <ResearchSourcesFields value={functionDraft.researchSources} onChange={researchSources => setFunctionDraft(value => ({ ...value, researchSources }))} />
            {functionDialog && functionDialog !== 'new' && <ResearchSourcePreflight item={functionDialog} />}
          </div>
          <DialogFooter className="mt-6"><Button variant="outline" onClick={() => setFunctionDialog(null)}>Cancel</Button><Button disabled={!functionDraft.name || !functionDraft.slug || !researchSourcesAreValid || functionMutation.isPending} onClick={() => {
            functionMutation.mutate({ current: functionDialog === 'new' ? null : functionDialog, values: functionDraft }, { onSuccess: () => setFunctionDialog(null) });
          }} data-testid="button-save-function"><Save className="mr-2 h-4 w-4" />Save function</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScheduleCard({ schedule, running, saving, onSave, onRun }: {
  schedule: FutureWorkSchedule;
  running: boolean;
  saving: boolean;
  onSave: (values: Partial<Pick<FutureWorkSchedule, 'enabled' | 'sourceWindowMonths' | 'staleAfterDays' | 'verificationOnlyOptIn'>>) => void;
  onRun: () => void;
}) {
  const [sourceWindowMonths, setSourceWindowMonths] = useState(schedule.sourceWindowMonths);
  const [staleAfterDays, setStaleAfterDays] = useState(schedule.staleAfterDays);
  return (
    <section className="border border-border bg-card/50 p-5" data-testid={`card-schedule-${schedule.id}`}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div><p className="text-[10px] uppercase tracking-widest text-primary">Research stream</p><h3 className="font-display text-2xl">{schedule.id}</h3><p className="mt-1 text-xs text-muted-foreground">Next run: {formatDate(schedule.nextRunAt)}</p></div>
        <div className="flex items-center gap-2"><Switch checked={schedule.enabled} onCheckedChange={enabled => onSave({ enabled })} disabled={saving} data-testid={`switch-schedule-${schedule.id}`} /><span className="text-xs">{schedule.enabled ? 'Active' : 'Paused'}</span></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor={`window-${schedule.id}`}>Source window (months)</Label><Input id={`window-${schedule.id}`} type="number" min={1} value={sourceWindowMonths} onChange={event => setSourceWindowMonths(Number(event.target.value))} data-testid={`input-source-window-${schedule.id}`} /></div>
        <div><Label htmlFor={`stale-${schedule.id}`}>Stale after (days)</Label><Input id={`stale-${schedule.id}`} type="number" min={1} value={staleAfterDays} onChange={event => setStaleAfterDays(Number(event.target.value))} data-testid={`input-stale-days-${schedule.id}`} /></div>
      </div>
      <div className="my-4 flex items-start justify-between gap-4 border-y border-border/60 py-3">
        <div><p className="text-sm font-medium">Verification-only refresh opt-in</p><p className="mt-1 text-xs text-muted-foreground">Only advances verification after a successful real re-check of an unchanged source. Failed checks never advance dates.</p></div>
        <Switch checked={schedule.verificationOnlyOptIn} onCheckedChange={verificationOnlyOptIn => onSave({ verificationOnlyOptIn })} disabled={saving} data-testid={`switch-verification-${schedule.id}`} />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => onSave({ sourceWindowMonths, staleAfterDays })} disabled={saving || sourceWindowMonths < 1 || staleAfterDays < 1} data-testid={`button-save-schedule-${schedule.id}`}><Settings2 className="mr-2 h-4 w-4" />Save settings</Button>
        <Button onClick={onRun} disabled={saving || running} data-testid={`button-run-${schedule.id}`}>{running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}{running ? 'Running' : 'Run bounded research'}</Button>
      </div>
    </section>
  );
}