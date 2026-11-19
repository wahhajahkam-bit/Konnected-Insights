import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Navbar } from '@/components/navbar';
import { Metadata } from '@/components/metadata';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Plus, Trash2, Edit2, ShieldCheck, ArrowLeft, Mail, RefreshCw, AlertCircle, CheckCircle2, PlayCircle, Settings2, HelpCircle } from 'lucide-react';
import { useClerk, useUser } from '@clerk/react';
import { Link, useLocation } from 'wouter';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Badge } from '@/components/ui/badge';
import { useNewsletterSources, useCreateNewsletterSource, useUpdateNewsletterSource, useDeleteNewsletterSource, useCheckNewsletterSource } from '@/hooks/use-newsletter-sources';
import { useEditorialItems } from '@/hooks/use-editorial';
import { NewsletterSource } from '@/lib/api-newsletter-sources';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { confirmUnsavedChanges, useUnsavedChanges } from '@/hooks/use-unsaved-changes';

const sourceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  senderEmail: z.string().email("Invalid email address"),
  subjectKeywords: z.string().optional(),
  instructions: z.string().optional(),
  referenceUrls: z.string().optional(),
  contributorId: z.string().min(1, "Contributor is required"),
  enabled: z.boolean().default(false),
}).superRefine((data, ctx) => {
  const hasKeywords = !!data.subjectKeywords?.trim();
  const hasInstructions = !!data.instructions?.trim();
  const hasUrls = !!data.referenceUrls?.trim();

  if (!hasKeywords && !hasInstructions && !hasUrls) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one discriminator (keywords, instructions, or reference URLs) is required",
      path: ["subjectKeywords"], // attach error to one of them
    });
  }
});

type SourceFormValues = z.infer<typeof sourceSchema>;

export default function NewsletterSources({ embedded = false }: { embedded?: boolean }) {
  const { user } = useUser();
  const [, setLocation] = useLocation();

  const [search, setSearch] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<NewsletterSource | null>(null);

  const { data: sourcesData, isLoading, error } = useNewsletterSources();
  const { data: contributorsData, isLoading: isLoadingContributors } = useEditorialItems('contributors', true);

  const deleteMutation = useDeleteNewsletterSource();
  const checkMutation = useCheckNewsletterSource();

  const filteredItems = useMemo(() => {
    if (!sourcesData?.sources) return [];
    return sourcesData.sources
      .filter(item => search === '' || item.name.toLowerCase().includes(search.toLowerCase()) || item.senderEmail.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sourcesData, search]);

  const selectedItem = sourcesData?.sources?.find(i => i.id === selectedItemId);

  const handleCheck = (id: string) => {
    checkMutation.mutate(id);
  };

  return (
    <div className={embedded ? "flex flex-col min-w-0" : "dark min-h-screen overflow-x-hidden bg-background text-foreground flex flex-col selection:bg-primary selection:text-primary-foreground cinematic-vignette"}>
      {!embedded && <>
        <Metadata title="Newsletter Sources | Admin" />
        <div className="noise-overlay" />
        <Navbar alwaysDark />
      </>}

      <section aria-label="Email newsletter source settings" className={embedded ? "flex flex-col min-w-0" : "flex-grow pt-24 flex flex-col container mx-auto px-4 md:px-6 max-w-screen-2xl"}>
        {/* Header Bar */}
        <div className="mb-6 p-4 border border-border bg-card/60 flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-sm">
          <div className="flex items-start gap-3">
            {!embedded && <Button variant="ghost" size="icon" aria-label="Back to desk" onClick={() => setLocation('/admin')} className="h-8 w-8 -ml-2 shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>}
            <div className="mt-0.5">
              <Mail className="w-5 h-5 text-primary flex-shrink-0" />
            </div>
            <div>
              <p className="font-medium text-sm text-foreground">Email Newsletter Sources</p>
              <p className="text-muted-foreground text-xs mt-1 max-w-2xl leading-relaxed">
                Draft-only intake: configure newsletter matching and check your connected mailbox to create reviewable drafts.
                Original emails are preserved and never modified. Missing evidence must be editorially completed before publishing.
              </p>
              {sourcesData?.scheduleUtc && (
                <div className="flex items-center gap-2 mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <PlayCircle className="w-3 h-3 text-primary" />
                  Daily checks: {sourcesData.scheduleUtc} UTC / 06:00 Dubai (while the server is running)
                </div>
              )}
              <p className="text-muted-foreground text-xs mt-2">
                Unattended daily operation requires a separately configured always-on server or external scheduled job.
              </p>
            </div>
          </div>
          <div className="flex-shrink-0 flex flex-col items-end justify-center gap-1">
            {isLoading ? (
              <span className="text-xs text-muted-foreground">Checking receiving mailbox…</span>
            ) : sourcesData?.mailbox ? (
              <>
              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 font-mono text-[10px] tracking-wider uppercase">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Mailbox Connected
              </Badge>
              <span className="text-xs text-muted-foreground break-all">Receiving inbox: {sourcesData.mailbox}</span>
              </>
            ) : sourcesData?.connectionError ? (
              <>
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 font-mono text-[10px] tracking-wider uppercase">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Mailbox Error
                </Badge>
                <div className="text-[10px] text-destructive/80 max-w-[200px] text-right truncate" title={sourcesData.connectionError}>
                  {sourcesData.connectionError}
                </div>
              </>
            ) : (
              <Badge variant="outline" className="bg-muted text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
                No Mailbox
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-6 h-[calc(100vh-14rem)] min-h-[600px] mb-12">
          {/* Left Sidebar */}
          <div className="w-full xl:w-1/3 flex flex-col gap-4 border border-border bg-card/50 backdrop-blur-md rounded-sm overflow-hidden shadow-2xl relative">
            <div className="p-4 border-b border-border bg-card/80">
              <h2 className="text-xl font-display mb-4 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary" /> Sources
              </h2>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search sources..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-9 text-xs bg-background/50 border-border/50"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {isLoading && (
                <div className="space-y-2 p-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full opacity-20" />)}
                </div>
              )}

              {error && (
                <div className="p-4 m-2 border border-destructive/50 bg-destructive/10 text-destructive-foreground text-sm flex flex-col items-center text-center">
                  <ShieldCheck className="w-6 h-6 mb-2 opacity-80" />
                  <p>Failed to load sources.</p>
                </div>
              )}

              {!isLoading && !error && filteredItems.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full border border-dashed border-border/50 flex items-center justify-center mb-4">
                    <Search className="w-5 h-5 opacity-50" />
                  </div>
                  No sources found.
                </div>
              )}

              {!isLoading && !error && filteredItems.map((item) => (
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
                      if (selectedItemId === item.id && !isCreating) return;
                      if (!confirmUnsavedChanges()) return;
                      setSelectedItemId(item.id);
                      setIsCreating(false);
                    }}
                    className="min-w-0 flex-1 p-3 pr-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          aria-hidden="true"
                          className={`w-1.5 h-1.5 rounded-full ${item.enabled ? 'bg-green-500' : 'bg-muted-foreground'}`}
                        />
                        <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">
                          {item.enabled ? 'Enabled' : 'Paused'}
                        </span>
                      </div>
                      <div className={`font-medium truncate text-sm ${selectedItemId === item.id ? 'text-primary' : 'text-foreground'}`}>
                        {item.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate opacity-70">
                        {item.senderEmail}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex-shrink-0 pr-3">
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
              <Button
                type="button"
                onClick={() => {
                  if (isCreating || !confirmUnsavedChanges()) return;
                  setIsCreating(true); setSelectedItemId(null);
                }}
                className="w-full text-xs uppercase tracking-widest flex gap-2 h-10"
              >
                <Plus className="w-4 h-4" /> Add Source
              </Button>
            </div>
          </div>

          {/* Right Area: Editor */}
          <div className="min-w-0 w-full xl:w-2/3 border border-border bg-card shadow-2xl rounded-sm flex flex-col relative overflow-hidden">
            {(isCreating || selectedItemId) ? (
              <div className="flex flex-col h-full overflow-y-auto">
                <SourceEditor
                  key={isCreating ? 'new-source' : selectedItemId}
                  source={isCreating ? undefined : selectedItem} 
                  contributors={contributorsData || []}
                  onClose={() => { setIsCreating(false); setSelectedItemId(null); }}
                  onCheck={isCreating ? undefined : () => handleCheck(selectedItem!.id)}
                  isChecking={checkMutation.isPending}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/50 p-12">
                <div className="w-24 h-24 border border-dashed border-border/30 rounded-full flex items-center justify-center mb-6">
                  <Edit2 className="w-8 h-8 opacity-50" />
                </div>
                <h3 className="text-xl font-display text-foreground/80 mb-2">Source Configuration</h3>
                <p className="text-sm font-light text-center max-w-sm">
                  Select a source to view its connection status and match rules, or add a new source.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <AlertDialog open={!!deleteConfirmItem} onOpenChange={(o) => !o && setDeleteConfirmItem(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this source?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the source "{deleteConfirmItem?.name}". 
              Any newsletter drafts already created from this source will be retained, but future imports will stop.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs uppercase tracking-widest">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs uppercase tracking-widest"
              onClick={() => {
                if (deleteConfirmItem) {
                  if (selectedItemId === deleteConfirmItem.id && !confirmUnsavedChanges()) return;
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

function SourceEditor({ 
  source, 
  contributors,
  onClose,
  onCheck,
  isChecking
}: { 
  source?: NewsletterSource;
  contributors: any[];
  onClose: () => void;
  onCheck?: () => void;
  isChecking: boolean;
}) {
  const createMutation = useCreateNewsletterSource();
  const updateMutation = useUpdateNewsletterSource();
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const form = useForm<SourceFormValues>({
    resolver: zodResolver(sourceSchema),
    defaultValues: {
      name: source?.name || '',
      senderEmail: source?.senderEmail || '',
      subjectKeywords: source?.subjectKeywords?.join(', ') || '',
      instructions: source?.instructions || '',
      referenceUrls: source?.referenceUrls?.join('\n') || '',
      contributorId: source?.contributorId || '',
      enabled: source?.enabled ?? false,
    }
  });

  const { confirmDiscard, markClean } = useUnsavedChanges(form.formState.isDirty);

  // Reset form when source changes
  useEffect(() => {
    if (form.formState.isDirty) return;
    form.reset({
      name: source?.name || '',
      senderEmail: source?.senderEmail || '',
      subjectKeywords: source?.subjectKeywords?.join(', ') || '',
      instructions: source?.instructions || '',
      referenceUrls: source?.referenceUrls?.join('\n') || '',
      contributorId: source?.contributorId || '',
      enabled: source?.enabled ?? false,
    });
  }, [source, form]);

  const onSubmit = (values: SourceFormValues) => {
    const payload = {
      name: values.name,
      senderEmail: values.senderEmail,
      subjectKeywords: values.subjectKeywords ? values.subjectKeywords.split(',').map(s => s.trim()).filter(Boolean) : [],
      instructions: values.instructions,
      referenceUrls: values.referenceUrls ? values.referenceUrls.split('\n').map(s => s.trim()).filter(Boolean) : [],
      contributorId: values.contributorId,
      enabled: values.enabled,
    };

    if (source) {
      updateMutation.mutate({ id: source.id, expectedVersion: source.version, data: payload }, {
        onSuccess: () => {
          form.reset(values);
          markClean();
        }
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          form.reset(values);
          markClean();
          onClose();
        }
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-card/80 flex items-center justify-between sticky top-0 z-10">
        <h2 className="text-xl font-display">{source ? 'Edit Source' : 'New Source'}</h2>
        <div className="flex gap-2">
          {source && onCheck && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isChecking || source.lastRun?.status === 'running'}
              onClick={onCheck}
              className="h-9 text-xs uppercase tracking-widest border-primary/20 text-primary hover:bg-primary/10"
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isChecking || source.lastRun?.status === 'running' ? 'animate-spin' : ''}`} />
              {source.lastRun?.status === 'running' ? 'Running...' : 'Check Now'}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => { if (confirmDiscard()) onClose(); }}
            className="h-9 text-xs uppercase tracking-widest"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={form.handleSubmit(onSubmit)}
            disabled={isSaving}
            className="h-9 text-xs uppercase tracking-widest"
          >
            {isSaving ? 'Saving...' : 'Save Source'}
          </Button>
        </div>
      </div>

      <div className="p-6 flex-1 max-w-3xl">
        {source?.lastRun && (
          <div className={`mb-8 p-4 rounded-sm border ${
            source.lastRun.status === 'failed' ? 'border-destructive/30 bg-destructive/5' : 
            source.lastRun.status === 'running' ? 'border-primary/30 bg-primary/5' : 
            source.lastRun.created > 0 ? 'border-green-500/30 bg-green-500/5' : 
            'border-border bg-muted/30'
          }`}>
            <h3 className="text-xs uppercase tracking-widest font-semibold mb-2 flex items-center gap-2">
              <RefreshCw className={`w-3.5 h-3.5 ${source.lastRun.status === 'running' ? 'animate-spin' : ''}`} />
              Latest Run Report 
              <span className="opacity-50 font-normal">
                ({new Date(source.lastRun.startedAt).toLocaleString()})
              </span>
            </h3>
            
            <div className="grid grid-cols-4 gap-4 mt-4">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="font-mono text-sm capitalize">{source.lastRun.status}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fetched</p>
                <p className="font-mono text-sm">{source.lastRun.fetched}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="font-mono text-sm">{source.lastRun.created}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Skipped</p>
                <p className="font-mono text-sm">{source.lastRun.skipped}</p>
              </div>
            </div>

            {source.lastRun.message && (
              <p className="text-sm mt-4 text-muted-foreground/80">{source.lastRun.message}</p>
            )}

            {source.lastRun.errors && source.lastRun.errors.length > 0 && (
              <div className="mt-4 p-3 bg-destructive/10 text-destructive-foreground text-xs rounded-sm space-y-1">
                {source.lastRun.errors.map((err, i) => <div key={i}>• {err}</div>)}
              </div>
            )}

            {source.lastRun.drafts && source.lastRun.drafts.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Created Drafts:</p>
                <ul className="space-y-1">
                  {source.lastRun.drafts.map(d => (
                    <li key={d.id}>
                      <Link href={`/admin?newsletterId=${d.id}`} className="text-sm text-primary hover:underline flex items-center gap-1">
                        {d.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Harvard Business Review" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="senderEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sender Email (Exact Match)</FormLabel>
                    <FormControl>
                      <Input placeholder="newsletters@hbr.org" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="contributorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assign Contributor</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an existing contributor" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {contributors?.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title || c.slug} {c.status === 'draft' ? '(Draft)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    All drafts imported from this source will be automatically assigned to this contributor.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="p-4 border border-primary/20 bg-primary/5 rounded-sm">
              <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
                <HelpCircle className="w-4 h-4" /> Match Rules
              </h4>
              <p className="text-xs text-muted-foreground mb-4">
                At least one discriminator must be provided below. The AI uses these hints to determine if an incoming email is the correct publication.
              </p>
              
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="subjectKeywords"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subject Keywords</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Daily Briefing, Weekly Update (comma separated)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="referenceUrls"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference URLs</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="e.g. https://hbr.org/newsletters (one per line)" 
                          className="font-mono text-xs min-h-[80px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="instructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>AI Instructions (Plain English)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="e.g. 'Look for the weekly digest email containing the main article. Ignore promotional emails.'" 
                          className="min-h-[100px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        Specific instructions help the AI parse the content correctly.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enable Daily Checks</FormLabel>
                    <FormDescription>
                      Check for drafts at 02:00 UTC while the server is running. This switch does not configure an external scheduler.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </form>
        </Form>
      </div>
    </div>
  );
}
