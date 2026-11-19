import React, { useState, useMemo } from 'react';
import { useAgentRuns, useAgentSummary, useCreateManualRun, useAgentInventory } from '@/hooks/use-agent-monitoring';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO, addDays } from 'date-fns';
import { AgentRunDetailsDialog } from './agent-run-details-dialog';
import { CreateManualRunDialog } from './create-manual-run-dialog';
import { AgentRunStatus } from '@/lib/agent-monitoring-api';
import { RefreshCw, Search, Calendar, ChevronLeft, ChevronRight, Activity, DollarSign, Database, FileText, CheckCircle2, XCircle, AlertCircle, Clock, Info } from 'lucide-react';

export function AgentMonitoring({ category }: { category: 'website' | 'replit' }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AgentRunStatus | 'all'>('all');
  const [agentId, setAgentId] = useState<string | 'all'>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const inventoryQuery = useAgentInventory();

  const fromIso = dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined;
  const toIso = useMemo(() => {
    if (!dateTo) return undefined;
    const date = new Date(`${dateTo}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString();
  }, [dateTo]);

  const queryParams = { 
    category, 
    status: status !== 'all' ? status : undefined, 
    agentId: agentId !== 'all' ? agentId : undefined,
    from: fromIso, 
    to: toIso 
  };

  const [isPolling, setIsPolling] = useState(false);

  const runsQuery = useAgentRuns({ ...queryParams, page, pageSize: 25 }, { refetchInterval: isPolling ? 5000 : false });
  const summaryQuery = useAgentSummary(queryParams, { refetchInterval: isPolling ? 5000 : false });

  React.useEffect(() => {
    const hasRunning = runsQuery.data?.items.some(r => r.status === 'running') || summaryQuery.data?.running;
    setIsPolling(!!hasRunning);
  }, [runsQuery.data, summaryQuery.data]);

  const handlePreviousPage = () => setPage(p => Math.max(1, p - 1));
  const handleNextPage = () => {
    if (runsQuery.data && page * 25 < runsQuery.data.total) {
      setPage(p => p + 1);
    }
  };

  const getStatusIcon = (runStatus: string) => {
    switch (runStatus) {
      case 'succeeded': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-destructive" />;
      case 'partial': return <AlertCircle className="w-4 h-4 text-amber-500" />;
      case 'running': return <RefreshCw className="w-4 h-4 text-primary animate-spin" />;
      case 'interrupted': return <Clock className="w-4 h-4 text-muted-foreground" />;
      default: return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getCostBadge = (run: any) => {
    if (run.costs && run.costs.length > 0) {
      return (
        <span className="flex items-center gap-1 text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-sm border border-primary/20">
          <DollarSign className="w-3 h-3" /> 
          {run.costs.map((c: any) => `${c.amount.toFixed(4)} ${c.currency}`).join(', ')}
        </span>
      );
    }
    
    if (run.costStatus === 'partial') {
      return (
        <span className="flex items-center gap-1 text-[10px] text-amber-500/80 bg-amber-500/10 px-1.5 py-0.5 rounded-sm border border-amber-500/20" title="Partial cost data available">
          <DollarSign className="w-3 h-3" /> Partial
        </span>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-background/30 p-4 border border-border/50">
        <div className="flex flex-wrap items-center gap-3">
          {category === 'website' && (
            <Select value={agentId} onValueChange={(val) => { setAgentId(val); setPage(1); }}>
              <SelectTrigger className="w-[160px] h-9 text-xs bg-background/50">
                <SelectValue placeholder="All Agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {inventoryQuery.data?.agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={status} onValueChange={(val) => { setStatus(val as any); setPage(1); }}>
            <SelectTrigger className="w-[140px] h-9 text-xs bg-background/50">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="succeeded">Succeeded</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="interrupted">Interrupted</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Input 
              type="date" 
              value={dateFrom} 
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="h-9 w-[140px] text-xs bg-background/50"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <Input 
              type="date" 
              value={dateTo} 
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="h-9 w-[140px] text-xs bg-background/50"
            />
          </div>
          
          {(status !== 'all' || dateFrom || dateTo) && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => { setStatus('all'); setDateFrom(''); setDateTo(''); setPage(1); }}
              className="h-9 text-xs"
            >
              Clear Filters
            </Button>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {category === 'replit' && (
            <CreateManualRunDialog />
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => { runsQuery.refetch(); summaryQuery.refetch(); }}
            disabled={runsQuery.isFetching}
            className="h-9 w-9 p-0"
          >
            <RefreshCw className={`w-4 h-4 ${runsQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {summaryQuery.data && (
        <div className="space-y-4">
          {!summaryQuery.data.historyCoverage.complete && (
            <div className="bg-amber-500/10 border border-amber-500/20 p-3 flex items-start gap-3 rounded-sm">
              <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-500 mb-0.5">Filtered totals cover imported records only</p>
                <p className="text-[10px] text-amber-500/80">
                  {summaryQuery.data.historyCoverage.message} ({summaryQuery.data.historyCoverage.remainingRuns} runs remaining)
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-card border border-border/50 p-3 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-display text-foreground">{summaryQuery.data.runs}</span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Total Runs</span>
            </div>
            <div className="bg-card border border-green-500/20 p-3 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-display text-green-500">{summaryQuery.data.succeeded}</span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Succeeded</span>
            </div>
            <div className="bg-card border border-destructive/20 p-3 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-display text-destructive">{summaryQuery.data.failed}</span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Failed</span>
            </div>
            <div className="bg-card border border-amber-500/20 p-3 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-display text-amber-500">{summaryQuery.data.partial}</span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Partial</span>
            </div>
            <div className="bg-card border border-border/50 p-3 flex flex-col items-center justify-center text-center">
              <span className="text-lg font-display text-foreground">
                {summaryQuery.data.elapsedMs > 60000 
                  ? `${(summaryQuery.data.elapsedMs / 60000).toFixed(1)}m` 
                  : `${(summaryQuery.data.elapsedMs / 1000).toFixed(1)}s`}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Total Compute</span>
            </div>
            <div className="bg-card border border-primary/20 p-3 flex flex-col items-center justify-center text-center">
              {summaryQuery.data.costs.length > 0 ? (
                <span className="text-lg font-display text-primary flex flex-col items-center">
                  {summaryQuery.data.costs.map((c, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {c.amount.toFixed(2)} {c.currency}
                      {c.provenance === 'manual' && <span className="text-[8px] opacity-60">(M)</span>}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-lg font-display text-muted-foreground">-</span>
              )}
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Estimated Cost</span>
              {(summaryQuery.data.unknownCostRuns > 0 || summaryQuery.data.partialCostRuns > 0) && (
                <div className="flex gap-2 mt-2 text-[9px]">
                  {summaryQuery.data.unknownCostRuns > 0 && <span className="text-muted-foreground">{summaryQuery.data.unknownCostRuns} unknown</span>}
                  {summaryQuery.data.partialCostRuns > 0 && <span className="text-amber-500">{summaryQuery.data.partialCostRuns} partial</span>}
                </div>
              )}
            </div>
          </div>

          {summaryQuery.data.byAgent.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {summaryQuery.data.byAgent.map(agent => (
                <div key={agent.agentId} className="flex items-center gap-2 bg-background/50 border border-border/50 px-3 py-1.5 rounded-sm text-xs">
                  <span className="font-medium">{agent.agentId}</span>
                  <span className="text-muted-foreground flex items-center gap-1.5 border-l border-border/50 pl-2">
                    <span className="text-foreground">{agent.runs} runs</span>
                    {agent.failed > 0 && <span className="text-destructive">({agent.failed} failed)</span>}
                    <span className="opacity-50">·</span>
                    <span>
                      {agent.elapsedMs > 60000 
                        ? `${(agent.elapsedMs / 60000).toFixed(1)}m` 
                        : `${(agent.elapsedMs / 1000).toFixed(1)}s`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-grow border border-border bg-card/50 overflow-hidden flex flex-col relative">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-muted-foreground bg-card/80 border-b border-border">
              <tr>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Cost / Detail</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {runsQuery.isLoading && (
                [1, 2, 3, 4, 5].map(i => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3"><Skeleton className="h-8 w-full opacity-20" /></td>
                  </tr>
                ))
              )}
              
              {!runsQuery.isLoading && runsQuery.data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <Database className="w-8 h-8 opacity-20 mb-3" />
                      <p>No runs found matching your criteria.</p>
                      {category === 'replit' && (
                        <p className="text-xs opacity-60 mt-2 max-w-sm">
                          Replit agent activity is not automatically tracked. You must log it manually.
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {runsQuery.data?.items.map((run) => (
                <tr key={run.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(run.status)}
                      <span className="text-xs uppercase tracking-wider hidden sm:inline-block">{run.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{run.agentId}</span>
                      {run.label && <span className="text-[10px] text-muted-foreground">{run.label}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {format(parseISO(run.startedAt), 'MMM d, HH:mm:ss')}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {run.elapsedMs ? (run.elapsedMs > 60000 
                      ? `${(run.elapsedMs / 60000).toFixed(1)}m` 
                      : `${(run.elapsedMs / 1000).toFixed(1)}s`) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getCostBadge(run)}
                      {run.provenance === 'manual' && (
                        <span className="text-[10px] px-1.5 py-0.5 border border-muted-foreground/30 text-muted-foreground rounded-sm">Manual</span>
                      )}
                      {run.outcome && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-background/50 border border-border/50 text-foreground rounded-sm truncate max-w-[120px] inline-block" title={run.outcome}>
                          {run.outcome}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-xs opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      onClick={() => setSelectedRunId(run.id)}
                    >
                      <FileText className="w-3 h-3 mr-1" /> Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {runsQuery.data && runsQuery.data.total > 0 && (
          <div className="mt-auto border-t border-border bg-card/80 p-3 flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Showing {((page - 1) * 25) + 1} to {Math.min(page * 25, runsQuery.data.total)} of {runsQuery.data.total}
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 w-7 p-0" 
                onClick={handlePreviousPage}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="px-2">Page {page}</span>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 w-7 p-0"
                onClick={handleNextPage}
                disabled={page * 25 >= runsQuery.data.total}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {selectedRunId && (
        <AgentRunDetailsDialog 
          runId={selectedRunId} 
          open={!!selectedRunId} 
          onOpenChange={(open) => !open && setSelectedRunId(null)} 
        />
      )}
    </div>
  );
}
