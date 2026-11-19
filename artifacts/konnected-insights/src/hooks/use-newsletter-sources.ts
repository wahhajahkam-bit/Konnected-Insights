import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/api';
import { newsletterSourcesApi, type NewsletterSource } from '../lib/api-newsletter-sources';
import { useToast } from '@/hooks/use-toast';
import { editorialKeys } from './use-editorial';

export const newsletterSourcesKeys = {
  all: ['newsletter-sources'] as const,
};

export function useNewsletterSources() {
  return useQuery({
    queryKey: newsletterSourcesKeys.all,
    queryFn: () => newsletterSourcesApi.list(),
    // Poll fast if there is a running task, otherwise 30s to catch scheduled background runs
    refetchInterval: (query) => {
      const hasRunning = query.state.data?.sources.some(s => s.lastRun?.status === 'running');
      return hasRunning ? 2000 : 30000;
    },
    staleTime: 10000,
  });
}

export function useCreateNewsletterSource() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: Partial<NewsletterSource>) => newsletterSourcesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: newsletterSourcesKeys.all });
      toast({ title: "Created successfully", description: "Newsletter source added." });
    },
    onError: (err) => {
      toast({ title: "Error creating source", description: err.message, variant: "destructive" });
    }
  });
}

export function useUpdateNewsletterSource() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: ({ id, expectedVersion, data }: { id: string, expectedVersion: number, data: Partial<NewsletterSource> }) => 
      newsletterSourcesApi.update(id, expectedVersion, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: newsletterSourcesKeys.all });
      toast({ title: "Updated successfully", description: "Newsletter source saved." });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        queryClient.invalidateQueries({ queryKey: newsletterSourcesKeys.all });
      }
      toast({ title: "Error updating source", description: err.message, variant: "destructive" });
    }
  });
}

export function useDeleteNewsletterSource() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string, expectedVersion: number }) => 
      newsletterSourcesApi.delete(id, expectedVersion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: newsletterSourcesKeys.all });
      toast({ title: "Deleted successfully", description: "The source has been removed (drafts retained)." });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        queryClient.invalidateQueries({ queryKey: newsletterSourcesKeys.all });
      }
      toast({ title: "Error deleting source", description: err.message, variant: "destructive" });
    }
  });
}

export function useCheckNewsletterSource() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => newsletterSourcesApi.check(id),
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: newsletterSourcesKeys.all });
      queryClient.invalidateQueries({ queryKey: editorialKeys.lists() });
      
      let title = "Check completed";
      if (report.status === 'failed') title = "Check failed";
      else if (report.status === 'partial') title = "Check completed with errors";
      else if (report.created === 0 && report.status === 'succeeded') title = "No new matches";
      
      toast({ 
        title, 
        description: `${report.created} drafts created, ${report.skipped} skipped. ${report.message || ''}`.trim(),
        variant: report.status === 'failed' ? 'destructive' : 'default'
      });
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: newsletterSourcesKeys.all });
      toast({ title: "Error running check", description: err.message, variant: "destructive" });
    }
  });
}
