import React from 'react';
import { useAgentRunDetails, useDeleteManualRun } from '@/hooks/use-agent-monitoring';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, XCircle, AlertCircle, Activity, Clock, DollarSign, Terminal, History, Code, Hash, Edit, Box, ExternalLink } from 'lucide-react';
import { CreateManualRunDialog } from './create-manual-run-dialog';
import { Link } from 'wouter';

interface Props {
  runId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentRunDetailsDialog({ runId, open, onOpenChange }: Props) {
  const { data, isLoading, error } = useAgentRunDetails(runId);
  const deleteRun = useDeleteManualRun();

  const getStatusIcon = (runStatus: string) => {
    switch (runStatus) {
      case 'succeeded': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'failed': return <XCircle className="w-5 h-5 text-destructive" />;
      case 'partial': return <AlertCircle className="w-5 h-5 text-amber-500" />;
      case 'running': return <Activity className="w-5 h-5 text-primary" />;
      case 'interrupted': return <Clock className="w-5 h-5 text-muted-foreground" />;
      default: return <Activity className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const handleDelete = () => {
    deleteRun.mutate(runId, {
      onSuccess: () => onOpenChange(false)
    });
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card border-border/50">
        {isLoading && (
          <div className="space-y-6 p-4">
            <Skeleton className="h-8 w-1/3" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {error && (
          <div className="p-8 border border-destructive/50 bg-destructive/10 flex flex-col items-center justify-center text-center">
            <XCircle className="w-8 h-8 text-destructive mb-4" />
            <p className="text-foreground font-medium mb-1">Failed to load run details</p>
            <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        )}

        {data && (
          <>
            <DialogHeader className="border-b border-border/50 pb-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(data.run.status)}
                  <DialogTitle className="text-xl font-display flex items-center gap-2">
                    {data.run.agentId} 
                    {data.run.label && <span className="text-sm text-muted-foreground font-sans">({data.run.label})</span>}
                  </DialogTitle>
                </div>
                {data.run.provenance === 'manual' && (
                  <div className="flex items-center gap-2">
                    <CreateManualRunDialog existingRun={data.run} trigger={
                      <Button variant="outline" size="sm" className="h-8 text-xs">
                        <Edit className="w-3 h-3 mr-2" /> Edit
                      </Button>
                    } />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive">
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete manual record?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will soft-delete the manual tracking record. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete Record
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> {data.run.id}</span>
                <span className="uppercase tracking-widest px-1.5 py-0.5 border border-border/50 rounded-sm">
                  {data.run.category} / {data.run.provenance}
                </span>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-background/50 border border-border/50 p-4 rounded-sm">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Started</p>
                <p className="text-sm font-medium">{format(parseISO(data.run.startedAt), 'MMM d, yyyy HH:mm:ss')}</p>
              </div>
              <div className="bg-background/50 border border-border/50 p-4 rounded-sm">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Duration</p>
                <p className="text-sm font-medium">
                  {data.run.elapsedMs ? (data.run.elapsedMs > 60000 
                    ? `${(data.run.elapsedMs / 60000).toFixed(2)}m` 
                    : `${(data.run.elapsedMs / 1000).toFixed(2)}s`) : 'In progress'}
                </p>
              </div>
              <div className="bg-background/50 border border-border/50 p-4 rounded-sm">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Outcome</p>
                <p className="text-sm font-medium">{data.run.outcome || 'None recorded'}</p>
              </div>
              <div className="bg-background/50 border border-border/50 p-4 rounded-sm">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Estimated Cost</p>
                <p className="text-sm font-medium flex items-center gap-1">
                  {data.run.costAmount !== null ? (
                    <>
                      <DollarSign className="w-3 h-3 text-primary" />
                      <span className="text-primary">{data.run.costAmount.toFixed(4)} {data.run.currency}</span>
                      {data.run.costStatus === 'partial' && <span className="text-[10px] text-amber-500">(Partial)</span>}
                    </>
                  ) : 'Unknown'}
                </p>
              </div>
            </div>

            {(data.run.outputPath || data.run.reference || data.run.notes || data.source) && (
              <div className="bg-primary/5 border border-primary/20 p-4 rounded-sm mb-8 space-y-4">
                {data.run.outputPath && (
                  <div>
                    <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Output Path</h4>
                    <Link href={data.run.outputPath} className="text-sm text-primary hover:underline">
                      {data.run.outputPath}
                    </Link>
                  </div>
                )}
                {data.source?.outputs && data.source.outputs.length > 0 && (
                  <div>
                    <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">CMS Outputs</h4>
                    <div className="flex flex-col gap-1.5">
                      {data.source.outputs.map((output, idx) => (
                        <Link key={idx} href={output.path} className="text-sm text-primary hover:underline flex items-center gap-1.5 w-fit">
                          <ExternalLink className="w-3.5 h-3.5" />
                          {output.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {data.source?.counts && Object.keys(data.source.counts).length > 0 && (
                  <div>
                    <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Source Counts</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(data.source.counts).map(([key, count]) => (
                        <div key={key} className="bg-background/80 border border-border/50 px-2.5 py-1 text-xs rounded-sm">
                          <span className="text-muted-foreground mr-1.5">{key}:</span>
                          <span className="font-medium text-foreground">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {data.run.reference && (
                  <div>
                    <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Reference</h4>
                    <p className="text-sm font-mono bg-background/50 p-2 border border-border/50">{data.run.reference}</p>
                  </div>
                )}
                {data.run.notes && (
                  <div>
                    <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Notes</h4>
                    <p className="text-sm whitespace-pre-wrap">{data.run.notes}</p>
                  </div>
                )}
              </div>
            )}

            {data.operations.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-medium uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-border/50 pb-2">
                  <Terminal className="w-4 h-4" /> AI Operations ({data.operations.length})
                </h3>
                <div className="overflow-x-auto border border-border/50 rounded-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-background/80 text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border/50">
                      <tr>
                        <th className="px-3 py-2 font-medium">Key / Provider</th>
                        <th className="px-3 py-2 font-medium">Model</th>
                        <th className="px-3 py-2 font-medium">Tokens (In/Out/Cache)</th>
                        <th className="px-3 py-2 font-medium">Duration</th>
                        <th className="px-3 py-2 font-medium text-right">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {data.operations.map(op => (
                        <tr key={op.id} className="hover:bg-white/5 align-top">
                          <td className="px-3 py-2">
                            <div className="font-mono text-[10px] text-foreground mb-0.5">{op.key}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div>{op.model || '-'}</div>
                            {op.toolCalls !== null && op.toolCalls > 0 && (
                              <div className="text-[9px] text-muted-foreground mt-0.5">{op.toolCalls} tool calls</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {op.inputTokens !== null || op.outputTokens !== null ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="opacity-80">
                                  {op.inputTokens || 0} / {op.outputTokens || 0} 
                                  {op.cachedTokens ? ` / ${op.cachedTokens}c` : ''}
                                </span>
                                {(op.inputTextTokens !== undefined || op.inputImageTokens !== undefined || op.outputTextTokens !== undefined || op.outputImageTokens !== undefined) && (
                                  <span className="text-[9px] text-muted-foreground">
                                    {(op.inputTextTokens !== undefined || op.inputImageTokens !== undefined) ? `In: ${op.inputTextTokens||0}t ${op.inputImageTokens||0}img` : ''}
                                    {(op.inputTextTokens !== undefined || op.inputImageTokens !== undefined) && (op.outputTextTokens !== undefined || op.outputImageTokens !== undefined) ? ' | ' : ''}
                                    {(op.outputTextTokens !== undefined || op.outputImageTokens !== undefined) ? `Out: ${op.outputTextTokens||0}t ${op.outputImageTokens||0}img` : ''}
                                  </span>
                                )}
                              </div>
                            ) : '-'}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {op.elapsedMs ? `${(op.elapsedMs / 1000).toFixed(2)}s` : '-'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {op.costAmount !== null ? (
                              <div className="flex flex-col items-end">
                                <span className={`font-medium ${op.partial ? 'text-amber-500' : 'text-primary'}`}>
                                  {op.costAmount.toFixed(4)} {op.currency}
                                </span>
                                {(op.pricingSource || op.pricingEffectiveDate) && (
                                  <span className="text-[9px] text-muted-foreground mt-0.5 flex gap-1 items-center justify-end">
                                    {op.pricingSource} {op.pricingEffectiveDate && `(${op.pricingEffectiveDate})`}
                                  </span>
                                )}
                                {op.breakdown && op.breakdown.length > 0 && (
                                  <div className="mt-1 w-full flex flex-col gap-0.5 text-[9px] text-muted-foreground/80 text-right">
                                    {op.breakdown.map((b, i) => (
                                      <div key={i} title={b.label}>{b.amount.toFixed(4)}</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {data.children.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-medium uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-border/50 pb-2">
                  <Code className="w-4 h-4" /> Child Runs ({data.children.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data.children.map(child => (
                    <div key={child.id} className="border border-border/50 p-3 bg-background/50 hover:border-primary/50 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm flex items-center gap-1.5">
                          {getStatusIcon(child.status)} {child.agentId}
                        </span>
                        {child.costAmount !== null && (
                          <span className="text-[10px] text-primary">{child.costAmount.toFixed(4)} {child.currency}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground flex justify-between">
                        <span>{format(parseISO(child.startedAt), 'HH:mm:ss')}</span>
                        <span>{child.elapsedMs ? `${(child.elapsedMs / 1000).toFixed(1)}s` : '-'}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.audit.length > 0 && (
              <div>
                <h3 className="text-sm font-medium uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-border/50 pb-2">
                  <History className="w-4 h-4" /> Audit Trail
                </h3>
                <div className="space-y-3">
                  {data.audit.map((audit, i) => (
                    <div key={i} className="flex gap-4 text-xs">
                      <div className="w-32 text-muted-foreground flex-shrink-0">
                        {format(parseISO(audit.at), 'MMM d, HH:mm:ss')}
                      </div>
                      <div>
                        <span className="font-medium uppercase tracking-wider mr-2">{audit.action}</span>
                        <span className="opacity-70">by {audit.actor}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
