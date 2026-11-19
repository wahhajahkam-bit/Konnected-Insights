import { AlertTriangle, CheckCircle2, Clock, Linkedin, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLinkedInIngestionStatus, useRunLinkedInIngestion } from '@/hooks/use-editorial';

export function LinkedInAutomationSection() {
  const { data: status, isLoading, error, refetch, isFetching } = useLinkedInIngestionStatus();
  const runIngestion = useRunLinkedInIngestion();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full opacity-20 rounded-sm" />
        <Skeleton className="h-48 w-full opacity-20 rounded-sm" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 border border-destructive/30 bg-destructive/5 flex flex-col items-center text-center text-destructive rounded-sm">
        <AlertTriangle className="w-8 h-8 mb-4" />
        <p className="text-sm font-medium">Failed to load LinkedIn intake status.</p>
        <p className="text-[11px] mt-2 font-mono break-all max-w-xl">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="mt-5 text-xs uppercase tracking-widest">
          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Retry
        </Button>
      </div>
    );
  }

  if (!status?.configured) {
    return (
      <div className="border border-border bg-card/50 rounded-sm p-8 max-w-3xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-xl">LinkedIn intake is not configured</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              No LinkedIn API is configured. Create a newsletter draft in the editorial desk, then paste the newsletter text and its reference URL into AI Autofill for review.
            </p>
            <p className="text-xs text-muted-foreground mt-3">LinkedIn intake is draft-only and never publishes unattended.</p>
          </div>
        </div>
      </div>
    );
  }

  const lastRun = status.lastRun;
  const report = lastRun?.report;
  const running = lastRun?.status === 'running' || runIngestion.isPending;

  return (
    <div className="space-y-6">
      <div className="border border-primary/20 bg-primary/5 rounded-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-start gap-3">
          <Linkedin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-xl">LinkedIn newsletter intake</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Daily at {status.scheduleUtc} UTC from the approved Könsälidön page.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Draft-only source: every imported item requires editorial review before publishing.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={running}
          onClick={() => runIngestion.mutate()}
          className="h-9 text-xs uppercase tracking-widest shrink-0"
        >
          {running ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
          {running ? 'Checking' : 'Check now'}
        </Button>
      </div>

      <div className="border border-border bg-card/50 rounded-sm overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between gap-4">
          <h3 className="font-display text-lg">Last-run report</h3>
          {lastRun && (
            <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-sm ${
              lastRun.status === 'succeeded'
                ? 'text-green-500 bg-green-500/10'
                : lastRun.status === 'failed'
                  ? 'text-destructive bg-destructive/10'
                  : 'text-primary bg-primary/10'
            }`}>
              {lastRun.status}
            </span>
          )}
        </div>
        {!lastRun ? (
          <div className="p-8 text-sm text-muted-foreground text-center">No LinkedIn checks have run yet.</div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> Started {new Date(lastRun.startedAt).toLocaleString()}</span>
              {lastRun.completedAt && <span className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5" /> Completed {new Date(lastRun.completedAt).toLocaleString()}</span>}
            </div>
            {lastRun.error && (
              <div className="p-3 border border-destructive/20 bg-destructive/5 text-destructive text-sm rounded-sm">{lastRun.error}</div>
            )}
            {report && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    ['Fetched', report.fetched],
                    ['Drafts created', report.created],
                    ['Skipped', report.skipped],
                    ['Failed', report.failed],
                  ].map(([label, value]) => (
                    <div key={label} className="border border-border bg-background/30 p-4 rounded-sm">
                      <div className="text-2xl font-display">{value}</div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{label}</div>
                    </div>
                  ))}
                </div>
                {report.drafts.length > 0 && (
                  <div>
                    <h4 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Created drafts</h4>
                    <div className="border border-border rounded-sm divide-y divide-border">
                      {report.drafts.map(draft => <div key={draft.id} className="p-3 text-sm">{draft.title}</div>)}
                    </div>
                  </div>
                )}
                {report.errors.length > 0 && (
                  <div>
                    <h4 className="text-xs uppercase tracking-widest text-destructive mb-2">Errors</h4>
                    <div className="space-y-2">
                      {report.errors.map((message, index) => <p key={`${index}-${message}`} className="p-3 bg-destructive/5 text-destructive text-xs rounded-sm">{message}</p>)}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}