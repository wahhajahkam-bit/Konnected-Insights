import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import { editorialApi } from '@/lib/api';

export function useEditorialAccess() {
  const { isSignedIn, userId } = useAuth();
  
  return useQuery({
    queryKey: ['editorial-access', userId],
    queryFn: async () => (await editorialApi.access()).data,
    enabled: !!isSignedIn,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });
}
