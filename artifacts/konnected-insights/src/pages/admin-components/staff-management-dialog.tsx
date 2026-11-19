import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Shield, Mail, Trash2, ShieldCheck, Loader2, Info } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useEditorialStaffMembers,
  useAddEditorialStaffMember,
  useChangeEditorialStaffRole,
  useRemoveEditorialStaffMember,
} from '@/hooks/use-editorial-staff';
import { EditorialStaffMember } from '@/lib/api';

export function StaffManagementDialog({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px] bg-card border-border shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Staff Permissions
          </DialogTitle>
          <DialogDescription>
            Manage who has access to the editorial workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <StaffList />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StaffList() {
  const { data: members, isLoading, error } = useEditorialStaffMembers(true);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'editor'>('editor');
  
  const addMutation = useAddEditorialStaffMember();
  const removeMutation = useRemoveEditorialStaffMember();
  const changeRoleMutation = useChangeEditorialStaffRole();

  const [memberToRemove, setMemberToRemove] = useState<EditorialStaffMember | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes('@')) return;
    addMutation.mutate(
      { email: newEmail, role: newRole },
      {
        onSuccess: () => {
          setNewEmail('');
          setNewRole('editor');
        },
      }
    );
  };

  const handleRoleChange = (member: EditorialStaffMember, newRole: 'admin' | 'editor') => {
    if (member.role === newRole || member.role === 'owner') return;
    changeRoleMutation.mutate({ member, role: newRole });
  };

  if (error) {
    return (
      <div className="p-4 border border-destructive/50 bg-destructive/10 text-destructive-foreground text-sm rounded-sm">
        Failed to load staff members.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-primary/5 border border-primary/20 rounded-sm p-3 flex items-start gap-3">
        <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          An invitation email is sent to each new team member. They accept it, sign up with that exact email address, and create their own secure password.
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="colleague@example.com"
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="pl-9 h-10 bg-background/50"
            disabled={addMutation.isPending}
          />
        </div>
        <div className="w-full sm:w-32 flex-shrink-0">
          <Select 
            value={newRole} 
            onValueChange={(val) => setNewRole(val as 'admin' | 'editor')}
            disabled={addMutation.isPending}
          >
            <SelectTrigger className="h-10 bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button 
          type="submit" 
          disabled={addMutation.isPending || !newEmail}
          className="h-10 text-xs tracking-widest uppercase flex-shrink-0"
        >
          {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Invite'}
        </Button>
      </form>

      <div className="border border-border rounded-sm overflow-hidden bg-background/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-card/80 border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium w-32">Status</th>
                <th className="px-4 py-3 font-medium w-40">Role</th>
                <th className="px-4 py-3 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 opacity-50" />
                    Loading staff members...
                  </td>
                </tr>
              ) : members?.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No staff members found.
                  </td>
                </tr>
              ) : (
                members?.map((member) => (
                  <tr key={member.id} className="group transition-colors hover:bg-white/5">
                    <td className="px-4 py-3 align-middle">
                      <div className="font-medium text-foreground">{member.email}</div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Badge 
                        variant={member.status === 'active' ? 'default' : 'secondary'} 
                        className="text-[10px] tracking-wider uppercase h-5"
                      >
                        {member.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {member.role === 'owner' ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary/80 uppercase tracking-widest px-2 py-1 bg-primary/5 rounded border border-primary/20 w-fit">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Owner
                        </div>
                      ) : (
                        <Select
                          value={member.role}
                          onValueChange={(val) => handleRoleChange(member, val as 'admin' | 'editor')}
                          disabled={changeRoleMutation.isPending && changeRoleMutation.variables?.member.id === member.id}
                        >
                          <SelectTrigger className="h-8 text-xs bg-transparent border-transparent hover:border-border/50 focus:ring-1 focus:ring-primary w-28 shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="editor" className="text-xs">Editor</SelectItem>
                            <SelectItem value="admin" className="text-xs">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle text-right">
                      {member.role !== 'owner' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                          onClick={() => setMemberToRemove(member)}
                          disabled={removeMutation.isPending}
                          title="Revoke Access"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={!!memberToRemove} onOpenChange={(o) => !o && setMemberToRemove(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Editorial Access</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove access for <span className="font-semibold text-foreground">{memberToRemove?.email}</span>? 
              They will immediately lose access to the editorial workspace and will not be able to log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs uppercase tracking-widest">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs uppercase tracking-widest"
              onClick={() => {
                if (memberToRemove) {
                  removeMutation.mutate(memberToRemove, {
                    onSuccess: () => setMemberToRemove(null)
                  });
                }
              }}
            >
              Confirm Removal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
