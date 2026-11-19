import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, editorialApi, type EditorialItem } from '../lib/api';
import { useToast } from '@/hooks/use-toast';

export const editorialKeys = {
  all: ['editorial'] as const,
  lists: () => [...editorialKeys.all, 'list'] as const,
  list: (collection?: string, includeDrafts?: boolean) => [...editorialKeys.lists(), collection, includeDrafts] as const,
  details: () => [...editorialKeys.all, 'detail'] as const,
  detail: (collection: string, slug: string, includeDrafts?: boolean) => [...editorialKeys.details(), collection, slug, includeDrafts] as const,
  linkedInIngestion: () => [...editorialKeys.all, 'linkedin-ingestion'] as const,
};

export function useEditorialItems(collection?: string, includeDrafts?: boolean) {
  return useQuery({
    queryKey: editorialKeys.list(collection, includeDrafts),
    queryFn: () => editorialApi.list(collection, includeDrafts).then(res => res.data),
  });
}

export function useEditorialItem(collection: string, slug: string, includeDrafts?: boolean) {
  return useQuery({
    queryKey: editorialKeys.detail(collection, slug, includeDrafts),
    queryFn: () => editorialApi.get(collection, slug, includeDrafts).then(res => res.data),
    enabled: !!collection && !!slug,
  });
}

export function useCreateEditorialItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: Partial<EditorialItem>) => editorialApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: editorialKeys.lists() });
      toast({ title: "Created successfully", description: "The item has been created." });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        queryClient.invalidateQueries({ queryKey: editorialKeys.all });
      }
      toast({ title: "Error creating item", description: err.message, variant: "destructive" });
    }
  });
}

export function useUpdateEditorialItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: ({ id, expectedVersion, data }: { id: string, expectedVersion: number, data: Partial<EditorialItem> }) => 
      editorialApi.update(id, expectedVersion, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: editorialKeys.all });
      toast({ title: "Saved successfully", description: "The item has been updated." });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        queryClient.invalidateQueries({ queryKey: editorialKeys.all });
      }
      toast({ title: "Error updating item", description: err.message, variant: "destructive" });
    }
  });
}

export function useDeleteEditorialItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string, expectedVersion: number }) => 
      editorialApi.delete(id, expectedVersion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: editorialKeys.lists() });
      toast({ title: "Deleted successfully", description: "The item has been removed." });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        queryClient.invalidateQueries({ queryKey: editorialKeys.all });
      }
      toast({ title: "Error deleting item", description: err.message, variant: "destructive" });
    }
  });
}

export function useReorderEditorialItems() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: ({ collection, items }: { collection: string, items: { id: string; expectedVersion: number }[] }) => 
      editorialApi.reorder(collection, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: editorialKeys.lists() });
    },
    onError: (err) => {
      toast({ title: "Reorder failed", description: err.message, variant: "destructive" });
    }
  });
}

export function useGenerateEditorialContent() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: editorialApi.generate,
    onError: (err) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    }
  });
}

export function useGenerateEventImage() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: editorialApi.generateEventImage,
    onError: (err) => {
      toast({ title: "Image generation failed", description: err.message, variant: "destructive" });
    },
  });
}

export function useGenerateCoverImage() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: editorialApi.generateCoverImage,
    onError: (err) => {
      toast({ title: "Cover generation failed", description: err.message, variant: "destructive" });
    },
  });
}

export function useMarkEventEnded() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion: number }) =>
      editorialApi.markEnded(id, expectedVersion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: editorialKeys.all });
      toast({ title: "Event marked ended", description: "It will now appear in the Ended section." });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        queryClient.invalidateQueries({ queryKey: editorialKeys.all });
      }
      toast({ title: "Could not end event", description: err.message, variant: "destructive" });
    },
  });
}

export function useLinkedInIngestionStatus() {
  return useQuery({
    queryKey: editorialKeys.linkedInIngestion(),
    queryFn: () => editorialApi.linkedInIngestionStatus().then((response) => response.data),
    refetchInterval: (query) => query.state.data?.lastRun?.status === 'running' ? 2_000 : 60_000,
  });
}

export function useRunLinkedInIngestion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: editorialApi.runLinkedInIngestion,
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: editorialKeys.lists() });
      queryClient.invalidateQueries({ queryKey: editorialKeys.linkedInIngestion() });
      toast({
        title: "LinkedIn check complete",
        description: `${data.created} draft${data.created === 1 ? '' : 's'} created; ${data.skipped} skipped.`,
      });
    },
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey: editorialKeys.linkedInIngestion() });
      toast({
        title: "LinkedIn import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
