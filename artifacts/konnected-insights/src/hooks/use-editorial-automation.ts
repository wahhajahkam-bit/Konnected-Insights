import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { editorialAutomationApi, AutomationRule } from '@/lib/editorial-automation-api';
import { editorialKeys } from '@/hooks/use-editorial';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useRef } from 'react';

export function useAutomationConnection() {
  return useQuery({
    queryKey: ['editorial-automation-connection'],
    queryFn: async () => (await editorialAutomationApi.getConnection()).data,
  });
}

export function useAutomationRules() {
  const queryClient = useQueryClient();
  const previousRulesRef = useRef<AutomationRule[] | undefined>(undefined);
  
  const query = useQuery({
    queryKey: ['editorial-automation-rules'],
    queryFn: async () => (await editorialAutomationApi.getRules()).data,
    refetchInterval: 15000,
    staleTime: 30000,
  });

  useEffect(() => {
    if (query.data && previousRulesRef.current) {
      // Check if any rule has a new lastRunAt compared to previous
      const oldRules = previousRulesRef.current;
      const newRuns = query.data.some(newRule => {
        const oldRule = oldRules.find(r => r.id === newRule.id);
        return oldRule && (
          (newRule.lastRunAt && newRule.lastRunAt !== oldRule.lastRunAt)
          || newRule.updatedAt !== oldRule.updatedAt
        );
      });
      
      if (newRuns) {
        queryClient.invalidateQueries({ queryKey: editorialKeys.all });
      }
    }
    if (query.data) {
      previousRulesRef.current = query.data;
    }
  }, [query.data, queryClient]);

  return query;
}

export function useCreateAutomationRule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Partial<AutomationRule> & { confirmAutomaticPublishing?: boolean }) =>
      (await editorialAutomationApi.createRule(data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['editorial-automation-rules'] });
      toast({ title: 'Rule created successfully' });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to create rule', description: err.message, variant: 'destructive' });
    }
  });
}

export function useUpdateAutomationRule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AutomationRule> & { confirmAutomaticPublishing?: boolean } }) =>
      (await editorialAutomationApi.updateRule(id, data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['editorial-automation-rules'] });
      toast({ title: 'Rule updated successfully' });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update rule', description: err.message, variant: 'destructive' });
    }
  });
}

export function useDeleteAutomationRule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => editorialAutomationApi.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['editorial-automation-rules'] });
      toast({ title: 'Rule deleted successfully' });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to delete rule', description: err.message, variant: 'destructive' });
    }
  });
}

export function useRunAutomationRule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => (await editorialAutomationApi.runRule(id)).data,
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['editorial-automation-rules'] });
      queryClient.invalidateQueries({ queryKey: ['editorial-automation-runs', id] });
      queryClient.invalidateQueries({ queryKey: editorialKeys.all });
      toast({ 
        title: data.status === 'running' ? 'Import started' : `Run ${data.status}`,
        description: data.status === 'running'
          ? 'The import is running in the background. Open run history to follow its progress.'
          : `Created: ${data.created} · Skipped: ${data.skipped} · Failed: ${data.failed}`
      });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to start run', description: err.message, variant: 'destructive' });
    }
  });
}

export function useAutomationRuns(ruleId: string, options?: { refetchInterval?: number }) {
  const queryClient = useQueryClient();
  const previousRunsRef = useRef<any[] | undefined>(undefined);

  const query = useQuery({
    queryKey: ['editorial-automation-runs', ruleId],
    queryFn: async () => (await editorialAutomationApi.getRuns(ruleId)).data,
    enabled: !!ruleId,
    refetchInterval: options?.refetchInterval,
  });

  useEffect(() => {
    if (query.data && previousRunsRef.current) {
      const oldRuns = previousRunsRef.current;
      const completedRuns = query.data.some(newRun => {
        const oldRun = oldRuns.find(r => r.id === newRun.id);
        return oldRun && oldRun.status === 'running' && (newRun.status === 'completed' || newRun.status === 'failed');
      });

      if (completedRuns) {
        queryClient.invalidateQueries({ queryKey: editorialKeys.all });
        queryClient.invalidateQueries({ queryKey: ['editorial-automation-rules'] });
      }
    }
    if (query.data) {
      previousRunsRef.current = query.data;
    }
  }, [query.data, queryClient]);

  return query;
}
