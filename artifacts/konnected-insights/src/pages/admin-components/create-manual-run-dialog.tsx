import React, { useState, useEffect } from 'react';
import { useCreateManualRun, useUpdateManualRun } from '@/hooks/use-agent-monitoring';
import { AgentRun } from '@/lib/agent-monitoring-api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface Props {
  existingRun?: AgentRun;
  trigger?: React.ReactNode;
}

export function CreateManualRunDialog({ existingRun, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const createRun = useCreateManualRun();
  const updateRun = useUpdateManualRun();

  const isEditing = !!existingRun;
  const isPending = createRun.isPending || updateRun.isPending;

  const [label, setLabel] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [finishedAt, setFinishedAt] = useState('');
  const [durationMs, setDurationMs] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<string>('succeeded');
  const [durationMode, setDurationMode] = useState<'end_time' | 'duration'>('end_time');

  useEffect(() => {
    if (open) {
      if (existingRun) {
        setLabel(existingRun.label || '');
        setStartedAt(existingRun.startedAt ? format(parseISO(existingRun.startedAt), "yyyy-MM-dd'T'HH:mm") : '');
        
        if (existingRun.finishedAt) {
          setFinishedAt(format(parseISO(existingRun.finishedAt), "yyyy-MM-dd'T'HH:mm"));
          setDurationMode('end_time');
        } else if (existingRun.elapsedMs) {
          setDurationMs(existingRun.elapsedMs.toString());
          setDurationMode('duration');
        }

        setCostAmount(existingRun.costAmount !== null ? existingRun.costAmount.toString() : '');
        setCurrency(existingRun.currency || 'USD');
        setReference(existingRun.reference || '');
        setNotes(existingRun.notes || '');
        setStatus(existingRun.status);
      } else {
        const now = new Date();
        setStartedAt(format(now, "yyyy-MM-dd'T'HH:mm"));
        setFinishedAt(format(now, "yyyy-MM-dd'T'HH:mm"));
        setLabel('');
        setDurationMs('');
        setCostAmount('');
        setCurrency('USD');
        setReference('');
        setNotes('');
        setStatus('succeeded');
        setDurationMode('end_time');
      }
    }
  }, [open, existingRun]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!label.trim()) return;
    if (!startedAt) return;
    if (durationMode === 'end_time' && !finishedAt) return;
    if (durationMode === 'duration' && (!durationMs || isNaN(Number(durationMs)))) return;
    
    const payload = {
      label,
      startedAt: new Date(startedAt).toISOString(),
      ...(durationMode === 'end_time' ? { finishedAt: new Date(finishedAt).toISOString() } : { durationMs: Number(durationMs) }),
      ...(costAmount && !isNaN(Number(costAmount)) ? { costAmount: Number(costAmount), currency } : {}),
      ...(reference ? { reference } : {}),
      ...(notes ? { notes } : {}),
      status: status as any,
    };

    if (isEditing && existingRun) {
      updateRun.mutate(
        { id: existingRun.id, payload },
        { onSuccess: () => setOpen(false) }
      );
    } else {
      createRun.mutate(payload, { onSuccess: () => setOpen(false) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="h-9 text-xs uppercase tracking-widest bg-primary/10 border-primary/20 text-primary hover:bg-primary/20 hover:text-primary">
            <Plus className="w-4 h-4 mr-2" /> Log Replit Activity
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card border-border/50">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{isEditing ? 'Edit Manual Record' : 'Log Replit Agent Activity'}</DialogTitle>
          <DialogDescription>
            Record agent runs that occur outside the API integration, such as direct Replit interactions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="label" className="text-xs uppercase tracking-widest text-muted-foreground">Action / Purpose *</Label>
            <Input 
              id="label" 
              value={label} 
              onChange={e => setLabel(e.target.value)} 
              placeholder="e.g. Generated header component" 
              className="bg-background/50 border-border/50"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startedAt" className="text-xs uppercase tracking-widest text-muted-foreground">Start Time *</Label>
              <Input 
                id="startedAt" 
                type="datetime-local" 
                value={startedAt} 
                onChange={e => setStartedAt(e.target.value)} 
                className="bg-background/50 border-border/50 text-sm"
                required
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center h-4">
                <Label htmlFor="duration" className="text-xs uppercase tracking-widest text-muted-foreground">
                  {durationMode === 'end_time' ? 'End Time *' : 'Duration (ms) *'}
                </Label>
                <button 
                  type="button" 
                  onClick={() => setDurationMode(d => d === 'end_time' ? 'duration' : 'end_time')}
                  className="text-[10px] text-primary hover:underline"
                >
                  Use {durationMode === 'end_time' ? 'duration' : 'end time'}
                </button>
              </div>
              
              {durationMode === 'end_time' ? (
                <Input 
                  id="finishedAt" 
                  type="datetime-local" 
                  value={finishedAt} 
                  onChange={e => setFinishedAt(e.target.value)} 
                  className="bg-background/50 border-border/50 text-sm"
                  required
                />
              ) : (
                <Input 
                  id="durationMs" 
                  type="number" 
                  min="0"
                  value={durationMs} 
                  onChange={e => setDurationMs(e.target.value)} 
                  placeholder="e.g. 15000"
                  className="bg-background/50 border-border/50 text-sm"
                  required
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status" className="text-xs uppercase tracking-widest text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="bg-background/50 border-border/50 text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="succeeded">Succeeded</SelectItem>
                  <SelectItem value="partial">Partial / Manual fix</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="interrupted">Interrupted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="cost" className="text-xs uppercase tracking-widest text-muted-foreground flex justify-between">
                <span>Est. Cost</span>
                <span className="opacity-60">{currency}</span>
              </Label>
              <Input 
                id="cost" 
                type="number" 
                step="0.000001"
                min="0"
                value={costAmount} 
                onChange={e => setCostAmount(e.target.value)} 
                placeholder="0.0000"
                className="bg-background/50 border-border/50 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference" className="text-xs uppercase tracking-widest text-muted-foreground">Reference / PR / Commit</Label>
            <Input 
              id="reference" 
              value={reference} 
              onChange={e => setReference(e.target.value)} 
              placeholder="Optional link or ID" 
              className="bg-background/50 border-border/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-xs uppercase tracking-widest text-muted-foreground">Notes</Label>
            <Textarea 
              id="notes" 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
              placeholder="Any additional context..." 
              className="bg-background/50 border-border/50 min-h-[80px] resize-none"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-border/50">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !label || !startedAt || (durationMode === 'end_time' ? !finishedAt : !durationMs)}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Log Activity'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
