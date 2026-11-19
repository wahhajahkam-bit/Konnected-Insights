import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAutomationRuns } from '@/hooks/use-editorial-automation';
import { format, formatDistanceToNow } from 'date-fns';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';

export function AutomationRunsDialog({ 
  ruleId, 
  open, 
  onOpenChange 
}: { 
  ruleId: string | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const { data: runs, isLoading } = useAutomationRuns(ruleId || '', { 
    refetchInterval: open ? 3000 : undefined 
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-card border-border max-h-[80dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Recent Automation Runs</DialogTitle>
          <DialogDescription>
            History of execution for this rule. Automatically refreshes while open.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto mt-4 pr-2">
          {isLoading && (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading history...
            </div>
          )}

          {!isLoading && (!runs || runs.length === 0) && (
            <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center">
              <Clock className="w-8 h-8 opacity-20 mb-3" />
              This rule has not run yet.
            </div>
          )}

          {!isLoading && runs && runs.length > 0 && (
            <div className="space-y-3">
              {runs.map((run) => (
                <div key={run.id} className="border border-border/50 bg-background/30 rounded-sm p-4 text-sm flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {run.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                      {run.status === 'failed' && <XCircle className="w-4 h-4 text-destructive" />}
                      {run.status === 'running' && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                      
                      <span className="font-medium text-xs uppercase tracking-widest text-foreground">
                        {run.status}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(run.startedAt), 'MMM d, yyyy HH:mm')} 
                      {' '}
                      ({formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })})
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 py-2 border-y border-border/50 text-center">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Matched</span>
                      <span className="font-mono text-foreground">{run.matched}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Created</span>
                      <span className="font-mono text-green-500">{run.created}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Skipped</span>
                      <span className="font-mono text-muted-foreground">{run.skipped}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Failed</span>
                      <span className={`font-mono ${run.failed > 0 ? 'text-destructive' : 'text-foreground'}`}>
                        {run.failed}
                      </span>
                    </div>
                  </div>

                  {run.error && (
                    <div className="text-xs text-destructive bg-destructive/10 p-2 rounded-sm font-mono mt-1 whitespace-pre-wrap">
                      {run.error}
                    </div>
                  )}

                  {run.finishedAt && (
                    <div className="text-[10px] text-muted-foreground text-right">
                      Took {((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(1)}s
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
