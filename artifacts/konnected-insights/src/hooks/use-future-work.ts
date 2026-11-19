import { useQuery } from '@tanstack/react-query';
import { futureWorkApi } from '../lib/api-future-work';

export const futureWorkKeys = {
  all: ['future-work'] as const,
  overview: () => [...futureWorkKeys.all, 'overview'] as const,
  freshness: () => [...futureWorkKeys.all, 'freshness'] as const,
  function: (slug: string) => [...futureWorkKeys.all, 'function', slug] as const,
};

export function useFutureWorkOverview() {
  return useQuery({
    queryKey: futureWorkKeys.overview(),
    queryFn: () => futureWorkApi.getOverview().then(res => res.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useFutureWorkFreshness() {
  return useQuery({
    queryKey: futureWorkKeys.freshness(),
    queryFn: () => futureWorkApi.getFreshness().then(res => res.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useFutureWorkFunction(slug: string) {
  return useQuery({
    queryKey: futureWorkKeys.function(slug),
    queryFn: () => futureWorkApi.getFunction(slug).then(res => res.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
    enabled: !!slug,
  });
}
