import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sparkles, CheckCircle2, AlertTriangle, Info, Loader2, X, UploadCloud, Crop } from 'lucide-react';
import { useGenerateEditorialContent } from '@/hooks/use-editorial';
import { uploadApi, type AiAutofillResponse } from '@/lib/api';
import { ScreenshotCropDialog } from './screenshot-crop-dialog';

type ScreenshotItem = {
  id: number;
  file: File;
  previewUrl: string;
  evidenceUrl?: string;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
};

type AiAutofillPanelProps = {
  collection: string;
  currentDraft: {
    title: string;
    slug: string;
    data: any;
  };
  onApply: (data: AiAutofillResponse) => void;
  onApplyMedia?: (field: 'cover' | 'author', url: string) => void;
};

export function AiAutofillPanel({ collection, currentDraft, onApply, onApplyMedia }: AiAutofillPanelProps) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [guidance, setGuidance] = useState('');
  const [pendingDraft, setPendingDraft] = useState<AiAutofillResponse | null>(null);
  const [screenshotError, setScreenshotError] = useState('');
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [cropTarget, setCropTarget] = useState<{ item: ScreenshotItem; field: 'cover' | 'author' } | null>(null);
  const screenshotId = useRef(0);
  const screenshotItemsRef = useRef<ScreenshotItem[]>([]);
  screenshotItemsRef.current = screenshots;

  const generateMutation = useGenerateEditorialContent();

  useEffect(() => () => {
    screenshotItemsRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl));
  }, []);

  const clearGeneratedState = () => {
    setPendingDraft(null);
    generateMutation.reset();
  };

  const handleGenerate = () => {
    const payload = {
      collection,
      sourceUrl: sourceUrl.trim() || undefined,
      sourceText: sourceText.trim() || undefined,
      screenshotUrls: screenshots.flatMap(item => item.evidenceUrl ? [item.evidenceUrl] : []),
      guidance: guidance.trim() || undefined,
      currentDraft,
    };
    generateMutation.mutate(
      payload,
      {
        onSuccess: (res) => {
          setPendingDraft(res.data);
        }
      }
    );
  };

  const handleApply = () => {
    if (pendingDraft) {
      onApply(pendingDraft);
      setPendingDraft(null);
    }
  };

  const handleDiscard = () => {
    setPendingDraft(null);
  };

  const cannotGenerate = screenshots.some(item => item.status === 'uploading')
    || (
      !sourceUrl.trim()
      && !sourceText.trim()
      && !guidance.trim()
      && !screenshots.some(item => item.status === 'ready')
    );

  const uploadScreenshot = async (item: ScreenshotItem) => {
    clearGeneratedState();
    setScreenshots(current => current.map(candidate =>
      candidate.id === item.id ? { ...candidate, status: 'uploading', error: undefined } : candidate
    ));
    try {
      const uploaded = await new Promise<{ url: string }>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', uploadApi.evidenceUploadUrl);
        request.withCredentials = true;
        request.setRequestHeader('Content-Type', item.file.type);
        request.setRequestHeader('X-File-Name', encodeURIComponent(item.file.name));
        request.onload = () => {
          const response = JSON.parse(request.responseText || '{}');
          if (request.status >= 200 && request.status < 300 && response.data?.url) resolve(response.data);
          else reject(new Error(response.error?.message || 'Screenshot upload failed.'));
        };
        request.onerror = () => reject(new Error('Screenshot upload was interrupted.'));
        request.send(item.file);
      });
      setScreenshots(current => current.map(candidate =>
        candidate.id === item.id
          ? { ...candidate, status: 'ready', evidenceUrl: uploaded.url, error: undefined }
          : candidate
      ));
    } catch (error) {
      setScreenshots(current => current.map(candidate =>
        candidate.id === item.id
          ? { ...candidate, status: 'error', error: error instanceof Error ? error.message : 'Screenshot upload failed.' }
          : candidate
      ));
    }
  };

  const addScreenshots = (files: FileList | null) => {
    if (!files?.length) return;
    clearGeneratedState();
    setScreenshotError('');
    const available = 8 - screenshots.length;
    const selected = Array.from(files).slice(0, available);
    const valid: ScreenshotItem[] = [];
    const rejected: string[] = [];
    for (const file of selected) {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        rejected.push(`${file.name}: use JPEG, PNG, WebP, or GIF.`);
      } else if (file.size > 10 * 1024 * 1024) {
        rejected.push(`${file.name}: larger than 10 MB.`);
      } else {
        valid.push({
          id: ++screenshotId.current,
          file,
          previewUrl: URL.createObjectURL(file),
          status: 'uploading',
        });
      }
    }
    if (files.length > available) rejected.push(`Only ${available} more screenshot${available === 1 ? '' : 's'} can be added (8 maximum).`);
    if (rejected.length) setScreenshotError(rejected.join(' '));
    if (valid.length) {
      setScreenshots(current => [...current, ...valid]);
      valid.forEach(item => void uploadScreenshot(item));
    }
  };

  const removeScreenshot = (id: number) => {
    clearGeneratedState();
    setScreenshots(current => {
      const removed = current.find(item => item.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter(item => item.id !== id);
    });
  };

  return (
    <div className="bg-primary/5 border border-primary/20 p-4 sm:p-6 rounded-none space-y-4 relative overflow-hidden">
      {/* Decorative background accent */}
      <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
        <Sparkles className="w-48 h-48" />
      </div>

      <div className="relative z-10 flex items-start gap-4">
        <div className="p-2 bg-primary/10 text-primary">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1 space-y-1">
          <h3 className="text-sm uppercase tracking-widest font-semibold text-primary">AI Autofill</h3>
          <p className="text-xs text-muted-foreground">
            Automatically populate the form fields below from a screenshot, URL, or description.
            This fills the form for your review — it will not save or publish automatically.
          </p>
        </div>
      </div>

      <div className="relative z-10 grid gap-4 pt-2">
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <Label htmlFor="ai-screenshots" className="text-xs uppercase tracking-widest">Screenshots (Optional)</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Add up to 8 screenshots (10 MB each, 30 MB total). AI reads only visible details, uses a byline only when it is shown, and flags anything it cannot verify.
              </p>
            </div>
            <span data-testid="text-screenshot-count" className="shrink-0 text-[10px] text-muted-foreground">
              {screenshots.length} / 8
            </span>
          </div>
          <label
            data-testid="button-add-screenshots"
            className={`flex items-center justify-center gap-3 border border-dashed border-primary/30 bg-card p-5 text-xs uppercase tracking-widest hover:border-primary ${screenshots.length >= 8 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          >
            <UploadCloud className="h-4 w-4" />
            {screenshots.length ? 'Add more screenshots' : 'Choose screenshots'}
            <input
              id="ai-screenshots"
              data-testid="input-screenshots"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              disabled={screenshots.length >= 8}
              onChange={event => {
                addScreenshots(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
          {screenshotError && <p role="alert" data-testid="status-screenshot-batch-error" className="text-xs text-destructive">{screenshotError}</p>}
          {screenshots.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {screenshots.map((item, index) => (
                <div key={item.id} data-testid={`card-screenshot-${item.id}`} className="border border-border bg-card p-3">
                  <div className="flex gap-3">
                    <img src={item.previewUrl} alt={`Screenshot ${index + 1} preview`} className="h-20 w-24 shrink-0 object-contain bg-muted/30" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{item.file.name}</p>
                      <p data-testid={`status-screenshot-${item.id}`} className={`mt-1 text-[10px] ${item.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {item.status === 'uploading' && 'Uploading private evidence…'}
                        {item.status === 'ready' && 'Ready for AI review'}
                        {item.status === 'error' && item.error}
                      </p>
                    </div>
                    <Button
                      data-testid={`button-remove-screenshot-${item.id}`}
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeScreenshot(item.id)}
                      aria-label={`Remove screenshot ${index + 1}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.status === 'error' && (
                      <Button
                        data-testid={`button-retry-screenshot-${item.id}`}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void uploadScreenshot(item)}
                      >
                        Retry upload
                      </Button>
                    )}
                    {onApplyMedia && item.status === 'ready' && (
                      <>
                        <Button
                          data-testid={`button-crop-cover-${item.id}`}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setCropTarget({ item, field: 'cover' })}
                        >
                          <Crop className="mr-1.5 h-3.5 w-3.5" /> Crop for cover
                        </Button>
                        <Button
                          data-testid={`button-crop-author-${item.id}`}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setCropTarget({ item, field: 'author' })}
                        >
                          <Crop className="mr-1.5 h-3.5 w-3.5" /> Crop author photo
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            Screenshots remain private evidence. To reuse a photo publicly, crop only that photo and confirm no email text, browser chrome, or personal details are included.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-source-url" className="text-xs uppercase tracking-widest">
            Public source URL (Optional)
          </Label>
          <Input
            id="ai-source-url"
            placeholder={collection === 'contributors' ? 'https://www.linkedin.com/in/...' : collection === 'events' ? 'https://www.linkedin.com/events/...' : collection === 'newsletters' ? 'https://www.linkedin.com/pulse/...' : 'https://example.com/article'}
            value={sourceUrl}
            onChange={(e) => {
              setSourceUrl(e.target.value);
              clearGeneratedState();
            }}
            className="bg-card"
          />
          <p className="text-[11px] text-muted-foreground">
            Leave this empty when screenshots or pasted text are the only available evidence. A public link is not required.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-end justify-between gap-4">
            <Label htmlFor="ai-source-text" className="text-xs uppercase tracking-widest">Pasted source text (Optional)</Label>
            <span data-testid="text-source-character-count" className="text-[10px] text-muted-foreground">{sourceText.length.toLocaleString()} / 60,000</span>
          </div>
          <Textarea
            id="ai-source-text"
            data-testid="input-source-text"
            maxLength={60000}
            placeholder="Paste an email, announcement, transcript, or source text. Include the title and byline only when they appear in the source."
            value={sourceText}
            onChange={(e) => {
              setSourceText(e.target.value);
              clearGeneratedState();
            }}
            className="bg-card min-h-[160px]"
          />
          <p className="text-xs text-muted-foreground">
            AI treats this as editor-provided evidence. It will not claim the text was independently verified or invent a missing author.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-guidance" className="text-xs uppercase tracking-widest">Tell AI what this means (Optional)</Label>
          <Textarea
            id="ai-guidance"
            placeholder={collection === 'events' ? "Add any context not visible in the screenshot. AI will flag facts that still need confirmation." : "e.g. 'Extract the key quotes and format as a newsletter excerpt...'"}
            value={guidance}
            onChange={(e) => {
              setGuidance(e.target.value);
              clearGeneratedState();
            }}
            className="bg-card min-h-[80px]"
          />
        </div>

        <div aria-live="polite" className="space-y-4">
          {generateMutation.isError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{generateMutation.error?.message || 'Failed to generate content.'}</p>
            </div>
          )}

          {pendingDraft && !generateMutation.isPending && !generateMutation.isError && (
            <div className="bg-card border border-border p-4 space-y-4 mt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
                <div>
                  <h4 className="text-sm font-semibold">Content Generated</h4>
                  <div className="mt-1 space-y-1">
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      <span className="font-medium">Title:</span> {pendingDraft.title || 'Untitled'}
                    </p>
                    {pendingDraft.source.url && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        <span className="font-medium">Source:</span>{' '}
                        <a href={pendingDraft.source.url} target="_blank" rel="noreferrer" className="underline hover:text-primary">
                          {pendingDraft.source.title || pendingDraft.source.url}
                        </a>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button type="button" variant="outline" size="sm" onClick={handleDiscard} className="text-xs">
                    <X className="w-4 h-4 mr-1" /> Discard
                  </Button>
                  <Button type="button" size="sm" onClick={handleApply} className="text-xs bg-green-600 hover:bg-green-700 text-white">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Apply to Form
                  </Button>
                </div>
              </div>

              <div className="space-y-2 text-sm pt-2">
                {pendingDraft.feedback.completed.length > 0 && (
                  <div className="flex items-start gap-2 text-green-600 dark:text-green-500">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold block text-xs uppercase tracking-widest mb-1">Completed</span>
                      <ul className="list-disc list-inside space-y-0.5 text-xs text-foreground/80">
                        {pendingDraft.feedback.completed.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                )}
                {pendingDraft.feedback.missing.length > 0 && (
                  <div className="flex items-start gap-2 text-muted-foreground pt-2">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold block text-xs uppercase tracking-widest mb-1">Missing Info</span>
                      <ul className="list-disc list-inside space-y-0.5 text-xs">
                        {pendingDraft.feedback.missing.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                )}
                {pendingDraft.feedback.warnings.length > 0 && (
                  <div className="flex items-start gap-2 text-amber-600 dark:text-amber-500 pt-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold block text-xs uppercase tracking-widest mb-1">Warnings</span>
                      <ul className="list-disc list-inside space-y-0.5 text-xs text-foreground/80">
                        {pendingDraft.feedback.warnings.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={cannotGenerate || generateMutation.isPending}
            className="text-xs uppercase tracking-widest min-w-[140px]"
          >
            {generateMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
            ) : pendingDraft ? (
              <><Sparkles className="w-4 h-4 mr-2" /> Regenerate</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> Generate</>
            )}
          </Button>
        </div>
      </div>
      <ScreenshotCropDialog
        file={cropTarget?.item.file || null}
        field={cropTarget?.field || 'cover'}
        open={Boolean(cropTarget)}
        onOpenChange={open => {
          if (!open) setCropTarget(null);
        }}
        onApply={(field, url) => {
          onApplyMedia?.(field, url);
          setCropTarget(null);
        }}
      />
    </div>
  );
}
