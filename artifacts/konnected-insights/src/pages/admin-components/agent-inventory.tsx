import React from 'react';
import { useAgentInventory } from '@/hooks/use-agent-monitoring';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, ShieldAlert, Check, X, Clock, AlertTriangle, Info } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

export function AgentInventory() {
  const { data, isLoading, error } = useAgentInventory();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full opacity-20 rounded-none" />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 border border-destructive/50 bg-destructive/10 text-destructive-foreground text-sm flex flex-col items-center text-center">
        <ShieldAlert className="w-8 h-8 mb-3 opacity-80" />
        <p className="font-medium text-base mb-1">Failed to load agent inventory.</p>
        <p className="text-xs opacity-70">
          {error instanceof Error ? error.message : 'Unknown error occurred'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-background/50 p-4 border border-border/50">
        <div>
          <h2 className="text-lg font-display mb-1 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> Active Agents
          </h2>
          <p className="text-xs text-muted-foreground">
            Monitoring {data.agents.length} specialized agents across the platform.
          </p>
        </div>
        <div className="flex items-center gap-6 text-xs uppercase tracking-widest text-muted-foreground border-l border-border/50 pl-6">
          <div className="flex flex-col gap-1">
            <span className="opacity-60">Replit Live</span>
            <span className={`font-semibold flex items-center gap-1.5 ${data.replitLiveConnected ? 'text-green-500' : 'text-amber-500'}`}>
              {data.replitLiveConnected ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              {data.replitLiveConnected ? 'Connected' : 'Unavailable'}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="opacity-60">Tracking Since</span>
            <span className="font-semibold text-foreground">
              {data.trackingSince ? new Date(data.trackingSince).toLocaleDateString() : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {!data.historyCoverage.complete && (
        <div className="bg-amber-500/10 border border-amber-500/20 p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-500 mb-1">Incomplete Historical Data</p>
            <p className="text-xs text-amber-500/80">
              {data.historyCoverage.message} ({data.historyCoverage.remainingRuns} runs remaining to import)
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.agents.map((agent) => (
          <div key={agent.id} className="border border-border/50 bg-card p-4 hover:border-primary/50 transition-colors flex flex-col">
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-medium text-foreground text-sm">{agent.name}</h3>
              {agent.enabled !== null && (
                <div className={`text-[9px] uppercase tracking-widest px-2 py-0.5 border ${
                  agent.enabled 
                    ? 'border-green-500/50 text-green-500 bg-green-500/10' 
                    : 'border-muted-foreground/30 text-muted-foreground bg-muted-foreground/10'
                }`}>
                  {agent.enabled ? 'Enabled' : 'Disabled'}
                </div>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground mb-4 flex-grow">
              {agent.purpose}
            </p>
            
            <div className="flex flex-col gap-2 mt-auto pt-3 border-t border-border/50 text-xs">
              <div className="flex justify-between items-center text-muted-foreground">
                <span className="flex items-center gap-1.5"><Clock className="w-3 h-3 opacity-60" /> Schedule</span>
                <span className="font-medium">{agent.schedule || 'On Demand'}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span className="flex items-center gap-1.5"><Activity className="w-3 h-3 opacity-60" /> Last Activity</span>
                <span className="font-medium text-foreground">
                  {agent.latestActivity 
                    ? formatDistanceToNow(parseISO(agent.latestActivity), { addSuffix: true })
                    : 'No recent activity'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
