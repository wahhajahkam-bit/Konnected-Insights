import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  editorialStaffApi,
  type EditorialStaffMember,
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export const editorialStaffKeys = {
  all: ['editorial-staff'] as const,
};

export function useEditorialStaffMembers(enabled = true) {
  return useQuery({
    queryKey: editorialStaffKeys.all,
    queryFn: () => editorialStaffApi.list().then((response) => response.data),
    enabled,
    staleTime: 30_000,
  });
}

export function useAddEditorialStaffMember() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: 'admin' | 'editor' }) =>
      editorialStaffApi.add(email, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: editorialStaffKeys.all });
      toast({
        title: 'Invitation sent',
        description: 'They can accept the email invitation and create their own password.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not grant access',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useChangeEditorialStaffRole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({
      member,
      role,
    }: {
      member: EditorialStaffMember;
      role: 'admin' | 'editor';
    }) => editorialStaffApi.changeRole(member.id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: editorialStaffKeys.all });
      queryClient.invalidateQueries({ queryKey: ['editorial-access'] });
      toast({ title: 'Role updated', description: 'The new permission is active.' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not update role',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useRemoveEditorialStaffMember() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (member: EditorialStaffMember) =>
      editorialStaffApi.remove(member.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: editorialStaffKeys.all });
      queryClient.invalidateQueries({ queryKey: ['editorial-access'] });
      toast({ title: 'Permission removed', description: 'Editorial access was revoked.' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not remove access',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}