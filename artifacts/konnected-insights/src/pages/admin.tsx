import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Metadata } from '@/components/metadata';
import { useEditorialItems, useDeleteEditorialItem, useReorderEditorialItems, useUpdateEditorialItem } from '@/hooks/use-editorial';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Plus, Trash2, Edit2, MoveUp, MoveDown, Lock, ShieldAlert, Check, X, ShieldCheck, UserCog, LogOut, Mail, Telescope, Activity } from 'lucide-react';
import { EditorForm } from './admin-components/editor-form';
import { EditorialItem } from '@/lib/api';
import { useClerk, useUser } from '@clerk/react';
import { useEditorialAccess } from '@/hooks/use-access';
import { StaffManagementDialog } from './admin-components/staff-management-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import React, { useState, useMemo, useEffect } from 'react';
import { Link, useSearch } from 'wouter';

const COLLECTIONS = [
  { id: 'newsletters', label: 'Newsletters' },
  { id: 'masterclasses', label: 'Masterclasses' },
  { id: 'future-work', label: 'Future of Work' },
  { id: 'events', label: 'Events' },
  { id: 'talks', label: 'Talks' },
  { id: 'contributors', label: 'Contributors' },
  { id: 'communities', label: 'Communities' },
];

export default function Admin() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: access } = useEditorialAccess();
  const canManageStaff = access?.canManageStaff ?? false;

  const [collection, setCollection] = useState('newsletters');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all'|'draft'|'published'>('all');

  const { data: items, isLoading, error } = useEditorialItems(collection, true);
  const deleteMutation = useDeleteEditorialItem();
  const reorderMutation = useReorderEditorialItems();
  const updateMutation = useUpdateEditorialItem();

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<EditorialItem | null>(null);
  const query = useSearch();
  const linkedNewsletterId = new URLSearchParams(query).get('newsletterId');

  useEffect(() => {
    if (!linkedNewsletterId) return;
    setCollection('newsletters');
    setSelectedItemId(linkedNewsletterId);
    setIsCreating(false);
  }, [linkedNewsletterId]);

  const canReorder = search === '' && statusFilter === 'all';

  const filteredItems = useMemo(() => {
    if (!items) return [];
    return items
      .filter(item => statusFilter === 'all' || item.status === statusFilter)
      .filter(item =>
        search === '' ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.slug.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [items, search, statusFilter]);

  const selectedItem = items?.find(i => i.id === selectedItemId);

  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (!canReorder || !items) return;
    const sortedItems = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sortedItems.length) return;

    const newItems = [...sortedItems];
    const temp = newItems[index];
    newItems[index] = newItems[newIndex];
    newItems[newIndex] = temp;

    reorderMutation.mutate({
      collection,
      items: newItems.map(i => ({ id: i.id, expectedVersion: i.version }))
    });
  };

  const handleToggleStatus = (item: EditorialItem) => {
    updateMutation.mutate({
      id: item.id,
      expectedVersion: item.version,
      data: { status: item.status === 'published' ? 'draft' : 'published' }
    });
  };

  return (
    <div className="dark min-h-screen overflow-x-hidden bg-background text-foreground flex flex-col selection:bg-primary selection:text-primary-foreground">
      <Metadata title="Editorial Admin" />
      <div className="noise-overlay" />
      <Navbar alwaysDark />

      <main className="flex-grow pt-24 flex flex-col container mx-auto px-4 md:px-6 max-w-screen-2xl">
        <div className="mb-6 p-4 border border-primary/20 bg-primary/5 flex items-center justify-between gap-4 rounded-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0" />
            <div>
              <p className="font-medium text-sm text-foreground">Secured Staff Session</p>
              <p className="text-muted-foreground text-xs">{user?.primaryEmailAddress?.emailAddress || 'Authenticated Staff Member'}</p>
            </div>
          </div>
          <div className="flex-shrink-0 flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" size="sm" className="h-8 text-xs uppercase tracking-widest bg-background/50">
              <Link href="/admin/research" data-testid="link-admin-research">
                <Search className="mr-2 h-3.5 w-3.5" />
                Future of Work Research
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-8 text-xs uppercase tracking-widest bg-background/50">
              <Link href="/admin/future-work" data-testid="link-admin-future-work">
                <Telescope className="mr-2 h-3.5 w-3.5" />
                Future of Work
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-8 text-xs uppercase tracking-widest bg-background/50">
              <Link href="/admin/automation">
                <Mail className="mr-2 h-3.5 w-3.5" />
                Automation
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-8 text-xs uppercase tracking-widest bg-background/50">
              <Link href="/admin/agents">
                <Activity className="mr-2 h-3.5 w-3.5" />
                Agents
              </Link>
            </Button>
            {canManageStaff && (
              <StaffManagementDialog>
                <Button variant="outline" size="sm" className="h-8 text-xs uppercase tracking-widest bg-background/50">
                  <UserCog className="mr-2 h-3.5 w-3.5" />
                  Manage Staff
                </Button>
              </StaffManagementDialog>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })}
              className="h-8 text-xs uppercase tracking-widest bg-primary/20 text-primary hover:bg-primary/30 border-transparent shadow-none"
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign Out
            </Button>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-6 h-[calc(100vh-14rem)] min-h-[600px] mb-12">
          {/* Left Sidebar: Lists & Filters */}
          <div className="w-full xl:w-1/3 flex flex-col gap-4 border border-border bg-card/50 backdrop-blur-md rounded-sm overflow-hidden shadow-2xl relative">
            <div className="p-4 border-b border-border bg-card/80">
              <h2 className="text-xl font-display mb-4 flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" /> Desk
              </h2>

              <div className="flex flex-wrap gap-2 mb-4">
                {COLLECTIONS.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={`Select ${c.label} collection`}
                    onClick={() => {
                      setCollection(c.id);
                      setSelectedItemId(null);
                      setIsCreating(false);
                      setSearch('');
                    }}
                    className={`text-[10px] uppercase tracking-widest px-3 py-1.5 border transition-all ${
                      collection === c.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border/50 text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {c.label} {collection === c.id && items ? `(${items.length})` : ''}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <div className="relative flex-grow">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 h-9 text-xs bg-background/50 border-border/50"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as any)}
                  className="h-9 px-3 text-xs bg-background/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-muted-foreground uppercase tracking-widest w-32"
                >
                  <option value="all">All</option>
                  <option value="published">Published</option>
                  <option value="draft">Drafts</option>
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {isLoading && (
                <div className="space-y-2 p-2">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full opacity-20" />)}
                </div>
              )}

              {error && (
                <div className="p-4 m-2 border border-destructive/50 bg-destructive/10 text-destructive-foreground text-sm flex flex-col items-center text-center">
                  <ShieldAlert className="w-6 h-6 mb-2 opacity-80" />
                  <p>Failed to load collection.</p>
                  <p className="text-xs opacity-70 mt-1">{error.message}</p>
                </div>
              )}

              {!isLoading && !error && filteredItems?.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full border border-dashed border-border/50 flex items-center justify-center mb-4">
                    <Search className="w-5 h-5 opacity-50" />
                  </div>
                  No items found.
                </div>
              )}

              {!isLoading && !error && filteredItems?.map((item, index) => (
                <div
                  key={item.id}
                  className={`group flex items-center justify-between border transition-colors rounded-sm ${
                    selectedItemId === item.id
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:border-border/50 hover:bg-white/5'
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={selectedItemId === item.id}
                    onClick={() => {
                      setSelectedItemId(item.id);
                      setIsCreating(false);
                    }}
                    className="min-w-0 flex-1 p-3 pr-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          aria-hidden="true"
                          className={`w-1.5 h-1.5 rounded-full ${item.status === 'published' ? 'bg-green-500' : 'bg-amber-500'}`}
                        />
                        <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">
                          {item.status}
                        </span>
                      </div>
                      <div className={`font-medium truncate text-sm ${selectedItemId === item.id ? 'text-primary' : 'text-foreground'}`}>
                        {item.title}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex-shrink-0 pr-3">
                    <button
                      type="button"
                      aria-label="Move Up"
                      onClick={(e) => { e.stopPropagation(); handleMove(index, 'up'); }}
                      disabled={!canReorder || index === 0}
                      title={!canReorder ? "Clear search and filters to reorder" : "Move up"}
                      className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <MoveUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move Down"
                      onClick={(e) => { e.stopPropagation(); handleMove(index, 'down'); }}
                      disabled={!canReorder || index === filteredItems.length - 1}
                      title={!canReorder ? "Clear search and filters to reorder" : "Move down"}
                      className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <MoveDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete"
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmItem(item); }}
                      className="p-1.5 text-destructive hover:bg-destructive/20 rounded ml-1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-border bg-card/80 mt-auto">
              {!canReorder && items && items.length > 0 && (
                <p className="text-[10px] text-muted-foreground/60 mb-2 text-center">
                  Reordering is disabled while filters are active.
                </p>
              )}
              <Button
                type="button"
                aria-label={collection === 'newsletters' ? 'Create newsletter draft' : 'Create New Item'}
                onClick={() => { setIsCreating(true); setSelectedItemId(null); }}
                className="w-full text-xs uppercase tracking-widest flex gap-2 h-10"
              >
                <Plus className="w-4 h-4" /> {collection === 'newsletters' ? 'Create newsletter draft' : 'Create New'}
              </Button>
            </div>
          </div>

          {/* Right Area: Editor */}
          <div className="min-w-0 w-full xl:w-2/3 border border-border bg-card shadow-2xl rounded-sm flex flex-col relative overflow-hidden">
            {(isCreating || selectedItemId) ? (
              <EditorForm
                collection={collection}
                item={isCreating ? undefined : selectedItem}
                onClose={() => { setIsCreating(false); setSelectedItemId(null); }}
                onPublishToggle={selectedItem ? () => handleToggleStatus(selectedItem) : undefined}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/50 p-12">
                <div className="w-24 h-24 border border-dashed border-border/30 rounded-full flex items-center justify-center mb-6">
                  <Edit2 className="w-8 h-8 opacity-50" />
                </div>
                <h3 className="text-xl font-display text-foreground/80 mb-2">Editorial Desk</h3>
                <p className="text-sm font-light text-center max-w-sm">
                  Select an item from the left to edit its contents, or create a new entry for the {collection} collection.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <AlertDialog open={!!deleteConfirmItem} onOpenChange={(o) => !o && setDeleteConfirmItem(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the entry "{deleteConfirmItem?.title}".
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs uppercase tracking-widest">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs uppercase tracking-widest"
              onClick={() => {
                if (deleteConfirmItem) {
                  deleteMutation.mutate({ id: deleteConfirmItem.id, expectedVersion: deleteConfirmItem.version });
                  if (selectedItemId === deleteConfirmItem.id) {
                    setSelectedItemId(null);
                  }
                  setDeleteConfirmItem(null);
                }
              }}
            >
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
