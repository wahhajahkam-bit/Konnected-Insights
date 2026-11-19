import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentMonitoringApi, type ManualRunPayload } from '../lib/agent-monitoring-api';

export const agentMonitoringKeys = {
  all: ['agent-monitoring'] as const,
  inventory: () => [...agentMonitoringKeys.all, 'inventory'] as const,
  runs: (params: any) => [...agentMonitoringKeys.all, 'runs', params] as const,
  summary: (params: any) => [...agentMonitoringKeys.all, 'summary', params] as const,
  details: (id: string) => [...agentMonitoringKeys.all, 'details', id] as const,
};

export function useAgentInventory() {
  return useQuery({
    queryKey: agentMonitoringKeys.inventory(),
    queryFn: () => agentMonitoringApi.getInventory().then(res => res.data),
  });
}

export function useAgentRuns(params: Parameters<typeof agentMonitoringApi.getRuns>[0], options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: agentMonitoringKeys.runs(params),
    queryFn: () => agentMonitoringApi.getRuns(params).then(res => res.data),
    refetchInterval: options?.refetchInterval,
  });
}

export function useAgentSummary(params: Parameters<typeof agentMonitoringApi.getSummary>[0], options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: agentMonitoringKeys.summary(params),
    queryFn: () => agentMonitoringApi.getSummary(params).then(res => res.data),
    refetchInterval: options?.refetchInterval,
  });
}

export function useAgentRunDetails(id: string, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: agentMonitoringKeys.details(id),
    queryFn: () => agentMonitoringApi.getRunDetails(id).then(res => res.data),
    enabled: !!id,
    refetchInterval: options?.refetchInterval,
  });
}

export function useCreateManualRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ManualRunPayload) => agentMonitoringApi.createManualRun(payload).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentMonitoringKeys.all });
    },
  });
}

export function useUpdateManualRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ManualRunPayload }) => 
      agentMonitoringApi.updateManualRun(id, payload).then(res => res.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: agentMonitoringKeys.all });
    },
  });
}

export function useDeleteManualRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentMonitoringApi.deleteManualRun(id).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentMonitoringKeys.all });
    },
  });
}
