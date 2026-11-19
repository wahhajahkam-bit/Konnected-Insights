import { useState, useMemo, useEffect } from 'react';
import { matchesResearchFilter } from './admin-components/research-history-filter';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Navbar } from '@/components/navbar';
import { ResearchRejections } from '@/components/research-rejections';
import { Metadata } from '@/components/metadata';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2, Play, Search, XCircle, SearchX 
} from 'lucide-react';
import { 
  adminFutureWorkApi, futureWorkErrorMessage, 
  type RunResultEntry, type FutureWorkRun
} from '@/lib/admin-future-work-api';

const CATEGORIES = [
  { id: 'news', label: 'Recent News · 01' },
  { id: 'programs', label: 'Recommended Programs · 02' },
  { id: '2030', label: '2030 Outlook' },
  { id: '2050', label: '2050 Forecast' },
  { id: '2100', label: '2100 Scenarios' },
] as const;

function ResearchSourceSnapshot({ sources }: {
  sources?: { urls: string[]; instructions: string } | null;
}) {
  if (!sources || (!sources.urls?.length && !sources.instructions)) return null;
  return (
    <div className="mt-3 border border-border/60 bg-background/30 p-3 text-xs" data-testid="research-source-snapshot">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Research source guidance used for this combination</p>
        <span className="border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">Private metadata</span>
      </div>
      {!!sources.urls?.length && <ul className="space-y-1">
        {sources.urls.map(url => <li key={url}><a href={url} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">{url}</a></li>)}
      </ul>}
      {sources.instructions && <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground"><strong className="text-foreground">Instructions:</strong> {sources.instructions}</p>}
    </div>
  );
}

export default function AdminResearch() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedFunctions, setSelectedFunctions] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [topic, setTopic] = useState('');
  const [historyFunction, setHistoryFunction] = useState('');
  const [historyCategory, setHistoryCategory] = useState('all');
  const historyQuery = useInfiniteQuery({
    queryKey: ['admin-future-work', 'run-history', historyFunction, historyCategory],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => adminFutureWorkApi.runHistory(historyFunction, historyCategory, pageParam),
    getNextPageParam: page => page.nextCursor ?? undefined,
    staleTime: 10_000,
    refetchInterval: ({ state }) => state.data?.pages.some(page =>
      page.items.some(run => run.status === 'running' || run.status === 'queued')) ? 4_000 : 30_000,
    refetchOnWindowFocus: true,
  });

  const query = useQuery({
    queryKey: ['admin-future-work'],
    queryFn: adminFutureWorkApi.get,
    staleTime: 10_000,
    refetchInterval: ({ state }) => {
      const data = state.data;
      return data?.runs.some(run => run.status === 'running' || run.status === 'queued') ? 4_000 : 30_000;
    },
    refetchOnWindowFocus: true,
  });

  const researchMutation = useMutation({
    mutationFn: (data: {
      functionIds?: string[];
      categories?: Array<'2030' | '2050' | '2100' | 'news' | 'programs'>;
      topic?: string;
    }) => adminFutureWorkApi.research(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-future-work'] });
      toast({ title: 'Research started', description: 'The research engine is now running.' });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Research failed', description: futureWorkErrorMessage(error) });
    }
  });

  const data = query.data;
  useEffect(() => {
    if (data) void queryClient.invalidateQueries({ queryKey: ['future-work'] });
  }, [data, queryClient]);
  const functions = useMemo(() => data?.functions.filter(f => f.enabled).sort((a, b) => a.sortOrder - b.sortOrder) || [], [data]);

  const handleResearchEverything = () => {
    researchMutation.mutate({});
  };

  const handleTargetedResearch = () => {
    const payload: any = {};
    if (selectedFunctions.size > 0) payload.functionIds = Array.from(selectedFunctions);
    if (selectedCategories.size > 0) payload.categories = Array.from(selectedCategories);
    if (topic.trim()) payload.topic = topic.trim();
    
    // empty arrays are invalid, but since we only assign if size > 0, it's fine
    researchMutation.mutate(payload);
  };

  const toggleFunction = (id: string) => {
    const next = new Set(selectedFunctions);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedFunctions(next);
  };

  const toggleCategory = (id: string) => {
    const next = new Set(selectedCategories);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCategories(next);
  };

  const activeRuns = data?.runs.filter(r => r.status === 'running' || r.status === 'queued') || [];
  const historyRuns = [...new Map((historyQuery.data?.pages.flatMap(page => page.items) ?? [])
    .map(run => [run.id, run])).values()];
  const visibleActive = historyRuns.filter(run => run.status === 'running' || run.status === 'queued');
  const visibleCompleted = historyRuns.filter(run => run.status !== 'running' && run.status !== 'queued');

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <Metadata title="Future of Work Research Engine" />
      <div className="noise-overlay" />
      <Navbar alwaysDark />
      <main className="container mx-auto max-w-screen-2xl px-4 pb-16 pt-24 md:px-6">
        <header className="mb-6 border border-primary/20 bg-primary/5 p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="flex items-start gap-3">
              <Search className="mt-1 h-5 w-5 text-primary" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-primary">Research Engine</p>
                <h1 className="mt-1 font-display text-3xl">Future of Work Research</h1>
                <p className="mt-1 text-sm text-muted-foreground">Supported automated findings publish without per-item approval. Manual editorial edits remain pending versions for review.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm"><Link href="/admin/future-work" data-testid="link-back-future-work"><ArrowLeft className="mr-2 h-4 w-4" />Back to desk</Link></Button>
              <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching} data-testid="button-refresh-research">
                <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />Refresh
              </Button>
            </div>
          </div>
        </header>

        {query.isLoading && <p role="status" className="mb-6">Loading research controls and history…</p>}
        {query.isError && <div role="alert" className="mb-6 border border-destructive p-4">
          <p>Research controls and history could not be loaded. {futureWorkErrorMessage(query.error)}</p>
          <Button className="mt-3" onClick={() => query.refetch()}>Retry</Button>
        </div>}
        {data && <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-6">
            <section className="border border-border bg-card/60 p-6">
              <h2 className="font-display text-2xl mb-2">Research Everything</h2>
              <p className="text-sm text-muted-foreground mb-6">Run the research engine across all active functions and categories. This may take several minutes.</p>
              <Button onClick={handleResearchEverything} disabled={researchMutation.isPending || activeRuns.length > 0} className="w-full" data-testid="button-research-everything">
                <Play className="w-4 h-4 mr-2" /> Research Everything
              </Button>
            </section>

            <section className="border border-border bg-card/60 p-6">
              <h2 className="font-display text-2xl mb-4">Targeted Research</h2>
              <div className="space-y-6">
                <div>
                  <Label className="mb-3 block text-sm">Functions (Optional)</Label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {functions.map(f => (
                      <div key={f.id} className="flex items-center gap-2">
                        <Checkbox id={`fn-${f.id}`} checked={selectedFunctions.has(f.id)} onCheckedChange={() => toggleFunction(f.id)} data-testid={`checkbox-fn-${f.id}`} />
                        <label htmlFor={`fn-${f.id}`} className="text-sm cursor-pointer select-none">{f.name}</label>
                      </div>
                    ))}
                    {!functions.length && <p className="text-xs text-muted-foreground">No active functions available.</p>}
                  </div>
                </div>

                <div>
                  <Label className="mb-3 block text-sm">Categories (Optional)</Label>
                  <div className="space-y-2">
                    {CATEGORIES.map(c => (
                      <div key={c.id} className="flex items-center gap-2">
                        <Checkbox id={`cat-${c.id}`} checked={selectedCategories.has(c.id)} onCheckedChange={() => toggleCategory(c.id)} data-testid={`checkbox-cat-${c.id}`} />
                        <label htmlFor={`cat-${c.id}`} className="text-sm cursor-pointer select-none">{c.label}</label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="topic-input" className="mb-2 block text-sm">Specific Topic (Optional)</Label>
                  <Input id="topic-input" placeholder="e.g. AI adoption, sustainability..." value={topic} onChange={e => setTopic(e.target.value)} data-testid="input-topic" />
                  <p className="text-xs text-muted-foreground mt-2">Leave blank to research the function broadly.</p>
                </div>

                <Button onClick={handleTargetedResearch} disabled={researchMutation.isPending || activeRuns.length > 0 || (selectedFunctions.size === 0 && selectedCategories.size === 0 && !topic.trim())} className="w-full" variant="secondary" data-testid="button-research-targeted">
                  <Play className="w-4 h-4 mr-2" /> Start Targeted Research
                </Button>
              </div>
            </section>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <h2 className="font-display text-2xl flex items-center gap-2">
              Research History 
              {activeRuns.length > 0 && <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full animate-pulse">Running</span>}
            </h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="history-function">History · function</Label><select id="history-function" value={historyFunction} onChange={event => setHistoryFunction(event.target.value)} className="mt-1 w-full border border-border bg-background p-2 text-sm">
                <option value="">All functions</option>{data?.functions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select></div>
              <div><Label htmlFor="history-category">History · category</Label><select id="history-category" value={historyCategory} onChange={event => setHistoryCategory(event.target.value)} className="mt-1 w-full border border-border bg-background p-2 text-sm">
                <option value="all">All categories</option>{CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select></div>
            </div>
            <p className="text-xs text-muted-foreground">All outcomes are retained: published, unchanged, nothing found, failed and skipped. Run totals cover the entire run; results below follow your history filters. Older unclassified records appear under All.</p>
            {historyQuery.isPending && <p role="status">Loading research history…</p>}
            {historyQuery.isError && <div role="alert" className="border border-destructive/40 p-4">
              <p>Research history could not be loaded. {futureWorkErrorMessage(historyQuery.error)}</p>
              <Button variant="outline" onClick={() => historyQuery.isFetchNextPageError ? historyQuery.fetchNextPage() : historyQuery.refetch()}>Retry history</Button>
            </div>}
            {visibleActive.map(run => (
              <RunCard key={run.id} run={run} functionId={historyFunction} category={historyCategory} />
            ))}

            {!historyQuery.isPending && !historyQuery.isError && !historyRuns.length && (
              <div className="border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                No research history matches these filters.
              </div>
            )}

            {visibleCompleted.map(run => (
              <RunCard key={run.id} run={run} functionId={historyFunction} category={historyCategory} />
            ))}
            {historyQuery.hasNextPage && <Button variant="outline" disabled={historyQuery.isFetching} onClick={() => historyQuery.fetchNextPage()} data-testid="button-earlier-research">
              {historyQuery.isFetchingNextPage ? 'Loading earlier runs…' : 'Load earlier runs'}
            </Button>}
            {!!historyRuns.length && !historyQuery.hasNextPage && <p className="text-xs text-muted-foreground">All matching research runs are shown.</p>}
          </div>
        </div>}
      </main>
    </div>
  );
}

function RunCard({ run, functionId, category }: { run: FutureWorkRun; functionId: string; category: string }) {
  const isRunning = run.status === 'running' || run.status === 'queued';
  const visiblePlan = run.plan?.filter(item =>
    (!functionId || !item.functionId || item.functionId === functionId)
    && (category === 'all' || (item.kind === 'content' ? String(item.horizon) : item.kind) === category),
  );
  return (
    <div className={`border p-5 ${isRunning ? 'border-primary/50 bg-primary/5' : 'border-border bg-card/40'}`} data-testid={`run-card-${run.id}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-4 border-b border-border/50">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{new Date(run.startedAt).toLocaleString()}</span>
            <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border ${
              isRunning ? 'border-primary text-primary' : 
              run.status === 'completed' ? 'border-emerald-500/50 text-emerald-400' : 
              'border-destructive/50 text-destructive'
            }`}>{run.status}</span>
            {run.plan && <span className="text-[10px] uppercase tracking-widest text-muted-foreground border border-border px-2 py-0.5">Plan: {run.plan.length} items</span>}
            {(!run.plan && run.scheduleId !== 'research') && <span className="text-[10px] uppercase tracking-widest text-muted-foreground border border-border px-2 py-0.5">Schedule: {run.scheduleId}</span>}
          </div>
          <p className="text-sm mt-2">Processed {run.processed}{run.plan ? ` / ${run.plan.length}` : ''} combinations</p>
          {run.outcomeCounts && (
            <div className="flex gap-2 mt-1 flex-wrap">
               {Object.entries(run.outcomeCounts).map(([k, v]) => (
                  <span key={k} className="text-[10px] uppercase tracking-widest text-muted-foreground">{k.replace('_', ' ')}: {v as number}</span>
               ))}
            </div>
          )}
        </div>
        <div className="text-right text-xs text-muted-foreground flex gap-4">
          <div><strong className="text-foreground block text-base">{run.sourcesFound}</strong> Sources</div>
          <div><strong className="text-emerald-400 block text-base">{run.sourcesAccepted}</strong> Accepted</div>
          <div><strong className="text-destructive block text-base">{run.sourcesRejected}</strong> Rejected</div>
        </div>
      </div>

      {!!run.errors?.length && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <p className="font-medium flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4" /> Errors occurred</p>
          <ul className="list-disc list-inside pl-5 space-y-1">
            {run.errors.map((err: string, i: number) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {!!visiblePlan?.length && (
        <details className="mb-4 border border-border/60 bg-background/20 p-3" open={isRunning} data-testid={`run-plan-${run.id}`}>
          <summary className="cursor-pointer text-xs font-medium">
            Planned combinations and source guidance ({visiblePlan.length})
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            The plan is recorded before research results. It shows the private source guidance snapshot used by each combination, including while a run is queued or running.
          </p>
          <div className="mt-3 space-y-3">
            {visiblePlan.map((item, index) => (
              <div key={`${item.functionId || item.name || 'combination'}-${item.kind}-${item.horizon || ''}-${item.lens || ''}-${index}`} className="border-t border-border/50 pt-3 first:border-0 first:pt-0">
                <p className="text-xs font-medium">{item.name || item.functionId || 'Planned function'} · {item.kind === 'content' ? `${item.horizon} · ${item.lens || 'all lenses'}` : item.kind}</p>
                {item.topic && <p className="mt-1 text-xs text-muted-foreground">Topic: {item.topic}</p>}
                <ResearchSourceSnapshot sources={item.researchSources} />
              </div>
            ))}
          </div>
        </details>
      )}
      {isRunning && !run.results?.length && (
        <p className="mb-4 border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground" role="status">
          Research is in progress. Results, search attempts, and source rejections will appear here as combinations finish; the recorded plan above is available before results.
        </p>
      )}

      {run.results && Array.isArray(run.results) && (
        <div className="space-y-3 mt-4">
          {run.results.filter(res => matchesResearchFilter(res, functionId, category)).map((res: RunResultEntry, i: number) => {
            if (typeof res === 'string') {
              return <div key={i} className="text-sm text-muted-foreground p-2 border border-border/30">{res}</div>;
            }
            
            const combo = res.combination;
            let kindText = combo.kind;
            if (combo.kind === 'content' && combo.horizon) kindText = `${combo.horizon} ${combo.lens || ''}`;
            else if (combo.kind === 'news') kindText = 'Recent news';
            else if (combo.kind === 'programs') kindText = 'Recommended programs';
            const title = `${combo.name} · ${kindText} ${combo.topic ? `[Topic: ${combo.topic}]` : ''}`;
            
            let outcome = res.outcome;
            if (!outcome) {
               const resultText = (res.result || '').toLowerCase();
               if (resultText.includes('no qualifying sources') || resultText.includes('nothing found')) outcome = 'nothing_found';
               else if (resultText.includes('failed')) outcome = 'failed';
               else if (resultText.includes('duplicate') || resultText.includes('awaits review')) outcome = 'skipped';
               else if (resultText.includes('reviewable_evidence')) outcome = 'draft_created';
            }

            let icon = <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
            let bgClass = 'bg-emerald-500/5 border-emerald-500/20';
            
            if (outcome === 'unchanged') {
              icon = <RefreshCw className="w-4 h-4 text-primary" />;
              bgClass = 'bg-primary/5 border-primary/20';
            } else if (outcome === 'nothing_found') {
              icon = <SearchX className="w-4 h-4 text-amber-400" />;
              bgClass = 'bg-amber-500/5 border-amber-500/20';
            } else if (outcome === 'failed' || outcome === 'skipped') {
              icon = <XCircle className="w-4 h-4 text-destructive" />;
              bgClass = 'bg-destructive/5 border-destructive/20';
            } else if (outcome === 'draft_created') {
              icon = <CheckCircle2 className="w-4 h-4 text-emerald-400 opacity-60" />;
              bgClass = 'bg-emerald-500/5 border-emerald-500/20 opacity-80';
            } else if (!res.outcome) {
              icon = <CheckCircle2 className="w-4 h-4 text-muted-foreground" />;
              bgClass = 'bg-muted/10 border-border/30';
            }

            return (
              <div key={i} className={`p-3 border ${bgClass} text-sm`}>
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div className="font-medium flex items-center gap-2">{icon} {title}</div>
                  {outcome && <span className="text-[10px] uppercase tracking-widest opacity-80">{outcome === 'draft_created' ? 'Draft created (legacy)' : outcome.replace('_', ' ')}</span>}
                </div>
                <p className="text-muted-foreground">{res.result}</p>
                {res.searchQuery && <p className="text-xs text-muted-foreground mt-2 opacity-70">Query: {res.searchQuery}</p>}
                <ResearchSourceSnapshot sources={combo.researchSources} />
                
                {res.url && (
                  <div className="mt-2 text-xs">
                     <p className="font-medium opacity-80 mb-1">Source:</p>
                     <a href={res.url} target="_blank" rel="noreferrer" className="text-primary hover:underline break-words">{res.title || res.url}</a>
                  </div>
                )}

                <ResearchRejections sources={res.rejected} />
                {res.attempts?.length ? (
                  <details className="mt-3 pt-3 border-t border-current/10">
                    <summary className="text-xs font-medium opacity-80 cursor-pointer mb-2">Search attempt details</summary>
                    {res.attempts && res.attempts.length > 0 && (
                       <div className="mb-2">
                          <p className="text-[10px] uppercase opacity-70 mb-1">Search Attempts</p>
                          <ul className="text-xs space-y-1 opacity-70">
                            {res.attempts.map((att, ai) => (
                               <li key={ai} className="break-words">
                                 <p className="font-medium">Attempt {ai + 1}: {att.searchQuery}</p>
                                 {!att.urls?.length && <p>No source URLs returned.</p>}
                                 {att.urls?.map(url => <a key={url} href={url} target="_blank" rel="noreferrer" className="block hover:underline">{url}</a>)}
                               </li>
                            ))}
                          </ul>
                       </div>
                    )}
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
