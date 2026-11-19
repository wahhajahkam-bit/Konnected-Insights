import React, { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { AutomationRule } from '@/lib/editorial-automation-api';
import { useCreateAutomationRule, useUpdateAutomationRule } from '@/hooks/use-editorial-automation';
import { AlertTriangle, Mail } from 'lucide-react';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';

const collections = [
  'newsletters', 'masterclasses', 'future-work', 'events', 
  'talks', 'contributors', 'communities'
] as const;

const ruleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  collection: z.enum(collections),
  senders: z.string().min(1, 'At least one sender is required').refine(data => {
    return data.split(',').map(s => s.trim()).filter(Boolean).every(s => s.includes('@'));
  }, { message: "Must be a comma-separated list of valid email addresses" }),
  search: z.string().optional(),
  guidance: z.string().optional(),
  enabled: z.boolean(),
  publishMode: z.enum(['draft', 'automatic']),
  scheduleUtc: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Must be HH:mm UTC time (e.g. 14:30)'),
  lookbackDays: z.coerce.number().int().min(1).max(30),
  maxItems: z.coerce.number().int().min(1).max(20),
  confirmAutomaticPublishing: z.boolean().optional()
}).refine(data => {
  if (data.publishMode === 'automatic' && !data.confirmAutomaticPublishing) {
    return false;
  }
  return true;
}, {
  message: "You must confirm to enable automatic publishing.",
  path: ["confirmAutomaticPublishing"]
});

type RuleFormValues = z.infer<typeof ruleSchema>;

export function AutomationRuleDialog({ 
  rule, 
  open, 
  onOpenChange 
}: { 
  rule?: AutomationRule | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const createMutation = useCreateAutomationRule();
  const updateMutation = useUpdateAutomationRule();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const form = useForm<RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      name: '',
      collection: 'newsletters',
      senders: '',
      search: '',
      guidance: '',
      enabled: false,
      publishMode: 'draft',
      scheduleUtc: '00:00',
      lookbackDays: 7,
      maxItems: 5,
      confirmAutomaticPublishing: false,
    },
  });

  const watchPublishMode = form.watch('publishMode');
  const { confirmDiscard, markClean } = useUnsavedChanges(open && form.formState.isDirty);
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !confirmDiscard()) return;
    if (!nextOpen) form.reset();
    onOpenChange(nextOpen);
  };

  useEffect(() => {
    if (open) {
      if (form.formState.isDirty) return;
      if (rule) {
        form.reset({
          name: rule.name,
          collection: rule.collection,
          senders: rule.senders.join(', '),
          search: rule.search,
          guidance: rule.guidance,
          enabled: rule.enabled,
          publishMode: rule.publishMode,
          scheduleUtc: rule.scheduleUtc,
          lookbackDays: rule.lookbackDays,
          maxItems: rule.maxItems,
          confirmAutomaticPublishing: false,
        });
      } else {
        form.reset({
          name: '',
          collection: 'newsletters',
          senders: '',
          search: '',
          guidance: '',
          enabled: false,
          publishMode: 'draft',
          scheduleUtc: '00:00',
          lookbackDays: 7,
          maxItems: 5,
          confirmAutomaticPublishing: false,
        });
      }
    }
  }, [open, rule, form]);

  const mutateFnRef = useRef(rule ? updateMutation.mutate : createMutation.mutate);
  mutateFnRef.current = rule ? updateMutation.mutate : createMutation.mutate;

  const onSubmit = (values: RuleFormValues) => {
    const onSaved = () => {
      form.reset(values);
      markClean();
      onOpenChange(false);
    };
    const data = {
      ...values,
      senders: values.senders ? values.senders.split(',').map(s => s.trim()).filter(Boolean) : [],
      search: values.search || '',
      guidance: values.guidance || '',
      confirmAutomaticPublishing: values.publishMode === 'automatic' ? values.confirmAutomaticPublishing : undefined,
    };
    
    if (rule) {
      mutateFnRef.current({ id: rule.id, data }, {
        onSuccess: onSaved
      });
    } else {
      mutateFnRef.current(data as any, {
        onSuccess: onSaved
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? 'Edit Automation Rule' : 'Create Automation Rule'}</DialogTitle>
          <DialogDescription>
            Configure how insights are automatically created from your connected mailbox.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="col-span-2 md:col-span-1">
                    <FormLabel>Rule Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Weekly Tech Newsletter" {...field} className="bg-background/50 text-xs" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="collection"
                render={({ field }) => (
                  <FormItem className="col-span-2 md:col-span-1">
                    <FormLabel>Target Collection</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background/50 text-xs h-9">
                          <SelectValue placeholder="Select a collection" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {collections.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="senders"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Allowed Senders (Exact Emails)</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="hello@newsletter.com, another@example.com" {...field} value={field.value || ''} className="pl-9 bg-background/50 text-xs" />
                    </div>
                  </FormControl>
                  <FormDescription className="text-[10px]">Comma-separated list of exact email addresses.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="search"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gmail Search Query</FormLabel>
                  <FormControl>
                    <Input placeholder="has:attachment subject:weekly" {...field} value={field.value || ''} className="bg-background/50 text-xs" />
                  </FormControl>
                  <FormDescription className="text-[10px]">Standard Gmail search operators to filter incoming mail.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="guidance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>AI Guidance (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Instructions for how the AI should extract and format this specific content..." 
                      className="resize-none h-20 bg-background/50 text-xs" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="scheduleUtc"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule (UTC)</FormLabel>
                    <FormControl>
                      <Input placeholder="14:30" {...field} className="bg-background/50 text-xs" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lookbackDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lookback (Days)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={30} {...field} className="bg-background/50 text-xs" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxItems"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Items/Run</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={20} {...field} className="bg-background/50 text-xs" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4 p-4 border border-border bg-card/50 rounded-sm">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Publish Mode</label>
                  <p className="text-[10px] text-muted-foreground">
                    Should imported items remain as drafts or be published immediately?
                  </p>
                </div>
                <FormField
                  control={form.control}
                  name="publishMode"
                  render={({ field }) => (
                    <FormItem className="mb-0">
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-32 bg-background/50 text-xs h-8">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">Drafts</SelectItem>
                          <SelectItem value="automatic">Automatic</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              {watchPublishMode === 'automatic' && (
                <div className="p-3 border border-destructive/30 bg-destructive/10 rounded-sm flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <FormField
                    control={form.control}
                    name="confirmAutomaticPublishing"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="mt-1 data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-destructive font-medium text-xs">
                            I understand that content will be published directly to the live site without editorial review.
                          </FormLabel>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-sm border p-4 bg-background/20">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm">Enable Rule</FormLabel>
                    <FormDescription className="text-[10px]">
                      When enabled, this rule runs automatically at the scheduled UTC time.
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} className="text-xs uppercase tracking-widest">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="text-xs uppercase tracking-widest">
                {isPending ? 'Saving...' : (rule ? 'Save Changes' : 'Create Rule')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}