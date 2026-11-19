import React, { useState } from 'react';
import { AlertTriangle, Clock, Edit2, History, Loader2, Mail, MoreVertical, Play, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAutomationConnection,
  useAutomationRules,
  useDeleteAutomationRule,
  useRunAutomationRule,
  useUpdateAutomationRule,
} from '@/hooks/use-editorial-automation';
import { AutomationRule } from '@/lib/editorial-automation-api';
import { AutomationRuleDialog } from './automation-rule-dialog';
import { AutomationRunsDialog } from './automation-runs-dialog';

export function AutomationRulesSection() {
  const { data: connection, isLoading: isConnectionLoading, error: connectionError, refetch: refetchConnection } = useAutomationConnection();
  const { data: rules, isLoading: isRulesLoading, error: rulesError } = useAutomationRules();
  const updateRule = useUpdateAutomationRule();
  const deleteRule = useDeleteAutomationRule();
  const runRule = useRunAutomationRule();
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [runsDialogOpen, setRunsDialogOpen] = useState(false);
  const [runsRuleId, setRunsRuleId] = useState<string | null>(null);
  const [deleteConfirmRule, setDeleteConfirmRule] = useState<AutomationRule | null>(null);
  const [runningRules, setRunningRules] = useState<Record<string, boolean>>({});

  const handleCreateNew = () => {
    setEditingRule(null);
    setRuleDialogOpen(true);
  };

  const handleEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    setRuleDialogOpen(true);
  };

  const handleViewRuns = (ruleId: string) => {
    setRunsRuleId(ruleId);
    setRunsDialogOpen(true);
  };

  const handleToggleEnabled = (rule: AutomationRule) => {
    updateRule.mutate({ id: rule.id, data: { enabled: !rule.enabled } });
  };

  const handleRunNow = (ruleId: string) => {
    setRunningRules(previous => ({ ...previous, [ruleId]: true }));
    runRule.mutate(ruleId, {
      onSettled: () => setRunningRules(previous => ({ ...previous, [ruleId]: false })),
    });
  };

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[300px_1fr] items-start">
        <div className="flex flex-col gap-6">
          <div className="border border-border bg-card/50 backdrop-blur-md rounded-sm p-5 shadow-2xl relative overflow-hidden">
            <h2 className="text-lg font-display mb-4 flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" /> Mailbox Connection
            </h2>
            {isConnectionLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4 opacity-20" />
                <Skeleton className="h-4 w-1/2 opacity-20" />
              </div>
            ) : connectionError ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2 text-sm text-destructive font-medium bg-destructive/10 p-2 rounded-sm border border-destructive/20">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>Connection Error</div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed break-all">
                  {(connectionError as Error)?.message || 'Failed to verify mailbox connection status.'}
                </p>
                <Button variant="outline" size="sm" onClick={() => refetchConnection()} className="w-full text-xs uppercase tracking-widest mt-2">
                  <RefreshCw className="w-3 h-3 mr-2" /> Retry
                </Button>
              </div>
            ) : connection?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-green-500 font-medium bg-green-500/10 p-2 rounded-sm border border-green-500/20">
                  <ShieldCheck className="w-4 h-4" /> Connected
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Authorized email:</span><br />
                  <span className="font-mono mt-1 inline-block">{connection.email || 'Unknown'}</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Switching or re-authorizing the mailbox requires secure Replit connector authorization from the project owner.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-2 text-sm text-amber-500 font-medium bg-amber-500/10 p-2 rounded-sm border border-amber-500/20">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>Not Connected</div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Setting up a connection requires Replit connector authorization. Contact the project owner to authorize the automation Gmail account.
                </p>
                {connection?.error && (
                  <p className="text-[10px] text-destructive font-mono bg-destructive/10 p-2 rounded-sm mt-2 break-all">{connection.error}</p>
                )}
                <Button variant="outline" size="sm" onClick={() => refetchConnection()} className="w-full text-xs uppercase tracking-widest mt-2">
                  <RefreshCw className="w-3 h-3 mr-2" /> Check Status
                </Button>
              </div>
            )}
          </div>
          <div className="border border-border bg-card/50 backdrop-blur-md rounded-sm p-5 shadow-2xl">
            <h3 className="text-sm font-display mb-3 flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4" /> Scheduler Status
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Automation tasks require a running API server. If the server goes to sleep, scheduled tasks will be suspended until the server wakes up.
              {' '}Email links and photos are omitted to protect subscriber privacy. Add independently verified public links and photos in the editor.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-display text-foreground">Active Rules</h2>
              <p className="text-xs text-muted-foreground mt-1">Configurable publishing automation. Rules may create drafts or publish automatically.</p>
            </div>
            <Button size="sm" onClick={handleCreateNew} disabled={!connection?.connected} className="h-9 text-xs uppercase tracking-widest bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" /> New Rule
            </Button>
          </div>
          {!connection?.connected && !isConnectionLoading && (
            <div className="p-8 border border-dashed border-border/50 text-center text-muted-foreground text-sm rounded-sm">
              Connect a mailbox to create and manage automation rules.
            </div>
          )}
          {connection?.connected && isRulesLoading && (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3].map(item => <Skeleton key={item} className="h-48 w-full opacity-20 rounded-sm" />)}
            </div>
          )}
          {connection?.connected && !isRulesLoading && rulesError && (
            <div className="p-8 border border-destructive/30 bg-destructive/5 flex flex-col items-center justify-center text-destructive text-sm rounded-sm">
              <AlertTriangle className="w-8 h-8 opacity-80 mb-4" />
              Failed to load automation rules.
              <p className="text-[10px] mt-2 opacity-80 font-mono break-all text-center max-w-lg">{(rulesError as Error)?.message || 'Unknown error'}</p>
            </div>
          )}
          {connection?.connected && !isRulesLoading && !rulesError && (!rules || rules.length === 0) && (
            <div className="p-12 border border-dashed border-border/50 flex flex-col items-center justify-center text-muted-foreground text-sm rounded-sm">
              <Mail className="w-8 h-8 opacity-20 mb-4" />
              No automation rules found.
              <Button variant="link" onClick={handleCreateNew} className="mt-2 text-primary">Create your first rule</Button>
            </div>
          )}
          {connection?.connected && !isRulesLoading && rules && rules.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
              {rules.map(rule => (
                <div key={rule.id} className={`flex flex-col border rounded-sm transition-colors ${rule.enabled ? 'border-primary/30 bg-card/60' : 'border-border/50 bg-card/20 opacity-80'}`}>
                  <div className="p-4 border-b border-border/50 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] uppercase tracking-widest text-primary font-semibold px-2 py-0.5 bg-primary/10 rounded-sm">{rule.collection}</span>
                        {rule.publishMode === 'automatic' && (
                          <span className="text-[9px] uppercase tracking-widest text-destructive font-semibold px-2 py-0.5 bg-destructive/10 rounded-sm">Auto-Publish</span>
                        )}
                      </div>
                      <h3 className="font-medium text-foreground truncate text-lg">{rule.name}</h3>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-sm -mr-2 text-muted-foreground hover:text-foreground">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40 bg-card border-border rounded-sm">
                        <DropdownMenuItem onClick={() => handleEdit(rule)} className="text-xs uppercase tracking-widest cursor-pointer">
                          <Edit2 className="mr-2 h-3.5 w-3.5" /> Edit Rule
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleViewRuns(rule.id)} className="text-xs uppercase tracking-widest cursor-pointer">
                          <History className="mr-2 h-3.5 w-3.5" /> View Runs
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeleteConfirmRule(rule)} className="text-xs uppercase tracking-widest cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive">
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="p-4 flex-1 flex flex-col text-sm space-y-3">
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-widest inline-block mb-1">Schedule &amp; Scope</span>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Daily at {rule.scheduleUtc} UTC</span>
                      </div>
                      <div className="text-muted-foreground text-[11px] mt-0.5">Checking last {rule.lookbackDays} days (max {rule.maxItems} items)</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-widest inline-block mb-1">Search</span>
                      <div className="font-mono text-[10px] bg-background/50 p-1.5 rounded break-all border border-border/50">{rule.search}</div>
                    </div>
                  </div>
                  <div className="p-4 border-t border-border/50 bg-background/30 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={rule.enabled} onCheckedChange={() => handleToggleEnabled(rule)} disabled={updateRule.isPending} />
                      <span className="text-xs text-muted-foreground uppercase tracking-widest">{rule.enabled ? 'Active' : 'Paused'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {rule.lastRunAt && (
                        <span className="text-[10px] text-muted-foreground hidden sm:inline-block">Last: {formatDistanceToNow(new Date(rule.lastRunAt), { addSuffix: true })}</span>
                      )}
                      <Button size="sm" variant="outline" onClick={() => handleRunNow(rule.id)} disabled={runningRules[rule.id]} className="h-7 text-[10px] uppercase tracking-widest">
                        {runningRules[rule.id] ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Play className="h-3 w-3 mr-1.5" />}
                        Run Now
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AutomationRuleDialog rule={editingRule} open={ruleDialogOpen} onOpenChange={setRuleDialogOpen} />
      <AutomationRunsDialog ruleId={runsRuleId} open={runsDialogOpen} onOpenChange={setRunsDialogOpen} />
      <AlertDialog open={!!deleteConfirmRule} onOpenChange={open => !open && setDeleteConfirmRule(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the automation rule "{deleteConfirmRule?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs uppercase tracking-widest">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs uppercase tracking-widest"
              onClick={() => {
                if (deleteConfirmRule) {
                  deleteRule.mutate(deleteConfirmRule.id);
                  setDeleteConfirmRule(null);
                }
              }}
            >
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}