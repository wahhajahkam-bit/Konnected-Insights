import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, EditorialItem, uploadApi } from '@/lib/api';
import { useCreateEditorialItem, useGenerateEventImage, useMarkEventEnded, useUpdateEditorialItem } from '@/hooks/use-editorial';
import { X, Image as ImageIcon, Save, Link2, UploadCloud, Plus, Trash2, AlertTriangle, Clock3, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AiAutofillPanel } from './ai-autofill-panel';
import { EditorCoverTools } from './editor-cover-tools';
import { AiAutofillResponse } from '@/lib/api';
import { applyEditorialAiData, getInitialEditorialData } from '@/lib/editorial-ai-apply';
import { newsletterFieldLabels, newsletterRequiredFieldIssues } from '@/lib/newsletter-required-fields';

// Basic Zod schema for EditorialItem base
const baseSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric and hyphens"),
  status: z.enum(['draft', 'published']),
  data: z.string().min(2, "Content data is required"),
});

type EditorFormProps = {
  collection: string;
  item?: EditorialItem;
  onClose: () => void;
  onPublishToggle?: () => void;
};

// Simulated known images for the picker
const KNOWN_ASSETS = [
  "/editorial/sourced/dubai-night.jpg",
  "/editorial/generated/ai-professions.jpg",
  "/editorial/generated/future-people.jpg",
  "/editorial/sourced/team-collaboration.jpg",
  "/editorial/generated/future-work-hero.jpg",
  "/editorial/generated/future-finance.jpg",
  "/original/varun-malik.jpg",
  "/contributors/savi.svg",
  "/contributors/vivaan.svg"
];

export function AssetPicker({ value, onChange, id, required, error, describedBy }: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  required?: boolean;
  error?: string;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');

  const uploadImage = async (file?: File) => {
    if (!file) return;
    setUploadError('');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setUploadError('Choose a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Images must be 10 MB or smaller.');
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const uploaded = await new Promise<{ data: { objectPath: string; url: string } }>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', uploadApi.uploadUrl);
        request.withCredentials = true;
        request.setRequestHeader('Content-Type', file.type);
        request.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onload = () => {
          let response: { data?: { objectPath: string; url: string }; error?: { message?: string } } = {};
          try {
            response = JSON.parse(request.responseText);
          } catch {
            // The generic error below is used for non-JSON upstream failures.
          }
          if (request.status >= 200 && request.status < 300 && response.data) {
            resolve({ data: response.data });
          } else {
            reject(new Error(response.error?.message || 'The image transfer failed.'));
          }
        };
        request.onerror = () => reject(new Error('The image transfer was interrupted.'));
        request.send(file);
      });
      onChange(uploaded.data.url);
      setOpen(false);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Image upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex gap-2 items-center">
      <Input id={id} value={value || ''} readOnly aria-required={required} aria-invalid={Boolean(error)} aria-describedby={describedBy} placeholder="No image selected" className="bg-muted/30 font-mono text-xs flex-1" />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label={id === 'newsletter-cover' ? 'Choose cover image' : 'Choose image'}><ImageIcon className="w-4 h-4" /></Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle>Select Asset</DialogTitle>
          </DialogHeader>
          <div className="mb-6 border border-dashed border-border p-4">
            <label className="flex cursor-pointer items-center justify-center gap-2 text-xs uppercase tracking-widest">
              <UploadCloud className="h-4 w-4" />
              {uploading ? `Uploading ${progress}%` : 'Upload image'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                disabled={uploading}
                onChange={(event) => void uploadImage(event.target.files?.[0])}
              />
            </label>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              JPEG, PNG, WebP, or GIF · maximum 10 MB
            </p>
            <div aria-live="polite" className="mt-3 text-center text-xs">
              {uploading && (
                <div
                  role="progressbar"
                  aria-label="Image upload progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                  className="h-1 overflow-hidden bg-muted"
                >
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}
              {uploadError && <p role="alert" className="mt-2 text-destructive">{uploadError}</p>}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 overflow-y-auto max-h-96">
            {KNOWN_ASSETS.map(asset => (
              <button
                key={asset}
                type="button"
                className={`relative aspect-square border overflow-hidden hover:border-primary group focus:outline-none focus:ring-2 focus:ring-primary ${value === asset ? 'border-primary' : 'border-border'}`}
                onClick={() => { onChange(asset); setOpen(false); }}
              >
                <img src={asset} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-[8px] text-white truncate px-1 py-0.5">
                  {asset.split('/').pop()}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function EditorForm({ collection, item, onClose, onPublishToggle }: EditorFormProps) {
  const createMutation = useCreateEditorialItem();
  const updateMutation = useUpdateEditorialItem();
  const generateEventImageMutation = useGenerateEventImage();
  const markEventEndedMutation = useMarkEventEnded();
  const [saveIssues, setSaveIssues] = useState<Array<{ path: Array<string | number>; message: string }>>([]);

  // Initialize form
  const { register, handleSubmit, control, reset, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      title: item?.title || '',
      slug: item?.slug || '',
      status: item?.status || 'draft',
      data: JSON.stringify(getInitialEditorialData(collection, item?.data), null, 2)
    }
  });

  // Watch for changes in item to re-initialize form
  useEffect(() => {
    reset({
      title: item?.title || '',
      slug: item?.slug || '',
      status: item?.status || 'draft',
      data: JSON.stringify(getInitialEditorialData(collection, item?.data), null, 2)
    });
  }, [item, reset, collection]);

  // Extract structured fields from data JSON for the custom editors
  const dataString = watch('data');
  const parsedData = React.useMemo(() => {
    try {
      return JSON.parse(dataString);
    } catch {
      return {};
    }
  }, [dataString]);

  const newsletterIssues = collection === 'newsletters'
    ? newsletterRequiredFieldIssues(parsedData)
    : [];

  // Clear stale server feedback when any newsletter metadata is corrected,
  // including changes applied by AI or through the advanced JSON editor.
  useEffect(() => {
    if (collection === 'newsletters') setSaveIssues([]);
  }, [collection, dataString]);

  const newsletterIssueFor = (field: string) => {
    const matches = (issue: { path: Array<string | number> }) => {
      const path = issue.path[0] === 'data' ? issue.path.slice(1) : issue.path;
      return path.join('.') === field || (field === 'author.name' && path.join('.') === 'author');
    };
    return newsletterIssues.find(matches)?.message || saveIssues.find(matches)?.message;
  };

  const updateDataField = (field: string, value: any) => {
    try {
      const current = JSON.parse(watch('data'));
      const next = { ...current, [field]: value };
      setValue('data', JSON.stringify(next, null, 2), { shouldDirty: true });
    } catch {
      // ignore
    }
  };

  const updateDataFields = (updates: Record<string, unknown>) => {
    try {
      const current = JSON.parse(watch('data'));
      setValue('data', JSON.stringify({ ...current, ...updates }, null, 2), { shouldDirty: true });
    } catch {
      // The advanced JSON editor will surface malformed JSON on save.
    }
  };

  const coverField = collection === 'future-work' ? 'img'
    : collection === 'talks' ? 'thumbnail'
    : collection === 'contributors' ? 'coverImage' : 'image';
  const coverImage = collection === 'events' ? parsedData.images?.[0] : parsedData[coverField];
  const updateCover = (url: string | undefined, provenance?: string) => {
    updateDataFields({
      ...(collection === 'events'
        ? { images: url ? [url, ...(Array.isArray(parsedData.images) ? parsedData.images.slice(1) : [])] : (Array.isArray(parsedData.images) ? parsedData.images.slice(1) : []) }
        : { [coverField]: url }),
      imageProvenance: provenance,
    });
  };

  const eventPublishIssues = React.useMemo(() => {
    if (collection !== 'events') return [];
    const issues: Array<{ path: string[]; message: string }> = [];
    for (const field of ['startAt', 'endAt']) {
      const value = parsedData[field];
      if (value && !/Z$|[+-]\d{2}:\d{2}$/.test(String(value))) {
        issues.push({ path: [field], message: 'Use an exact date and time with a UTC offset, for example +04:00.' });
      }
    }
    for (const field of ['sourceUrl', 'registrationUrl']) {
      const value = parsedData[field];
      if (value && !/^https?:\/\/\S+$/i.test(String(value))) {
        issues.push({ path: [field], message: 'Use a complete http(s) URL.' });
      }
    }
    return issues;
  }, [collection, parsedData]);

  const issueFor = (field: string) =>
    saveIssues.find((issue) => String(issue.path?.[0]) === field)?.message;

  const captureSaveError = (error: unknown) => {
    if (error instanceof ApiError && Array.isArray(error.details)) {
      setSaveIssues(error.details.map((issue) => ({
        path: issue.path || [],
        message: issue.message || 'Check this field.',
      })));
    }
  };

  const handleAiApply = (aiData: AiAutofillResponse) => {
    setValue('title', aiData.title, { shouldDirty: true, shouldValidate: true });
    setValue('slug', aiData.slug, { shouldDirty: true, shouldValidate: true });

    try {
      const current = JSON.parse(watch('data'));
      const next = applyEditorialAiData(collection, current, aiData.data);
      setValue('data', JSON.stringify(next, null, 2), { shouldDirty: true, shouldValidate: true });
    } catch {
      setValue('data', JSON.stringify(aiData.data, null, 2), { shouldDirty: true, shouldValidate: true });
    }
  };

  const onSubmit = (formData: any) => {
    setSaveIssues([]);
    let finalDataObj: any = {};
    try {
      finalDataObj = JSON.parse(formData.data);
    } catch (e) {
      alert("Invalid JSON in data field");
      return;
    }

    if (collection === 'newsletters') {
      const issues = newsletterRequiredFieldIssues(finalDataObj);
      if (issues.length > 0) {
        const field = issues[0].path.join('.');
        const id = field === 'image' ? 'cover' : field === 'author.name' ? 'author' : field;
        document.getElementById(`newsletter-${id}`)?.focus();
        return;
      }
    }

    // specific normalizations
    if (collection === 'talks' && finalDataObj.id) {
      // If it's a full youtube URL, extract ID
      const urlMatch = String(finalDataObj.id).match(/[?&]v=([^&]+)/);
      const shortMatch = String(finalDataObj.id).match(/youtu\.be\/([^?]+)/);
      if (urlMatch) finalDataObj.id = urlMatch[1];
      else if (shortMatch) finalDataObj.id = shortMatch[1];
    }
    if (collection === 'contributors') {
      finalDataObj.group = finalDataObj.group === 'Core Team' ? 'Core Team' : 'Contributors';
      if (Array.isArray(finalDataObj.contributions)) {
        finalDataObj.contributions = finalDataObj.contributions
          .map((contribution: any) => ({
            title: String(contribution.title || '').trim(),
            url: String(contribution.url || '').trim(),
            ...(String(contribution.description || '').trim()
              ? { description: String(contribution.description).trim() }
              : {}),
          }))
          .filter((contribution: any) => contribution.title || contribution.url);
      }
    }
    if (collection === 'events') {
      finalDataObj.images = Array.isArray(finalDataObj.images)
        ? finalDataObj.images.filter((image: unknown) => typeof image === 'string' && image.trim())
        : [];
      if (!finalDataObj.endAt) delete finalDataObj.endAt;
      if (!finalDataObj.registrationUrl) delete finalDataObj.registrationUrl;
    }

    if (collection === 'events' && formData.status === 'published' && eventPublishIssues.length > 0) {
      setSaveIssues(eventPublishIssues);
      return;
    }

    if (item) {
      updateMutation.mutate({
        id: item.id,
        expectedVersion: item.version,
        data: {
          title: formData.title,
          slug: formData.slug,
          status: formData.status,
          data: finalDataObj
        }
      }, { onError: captureSaveError });
    } else {
      createMutation.mutate({
        collection,
        title: formData.title,
        slug: formData.slug,
        status: formData.status,
        data: finalDataObj
      }, {
        onSuccess: () => {
          onClose();
        },
        onError: captureSaveError,
      });
    }
  };

  const renderCollectionSpecificFields = () => {
    switch (collection) {
      case 'newsletters':
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="newsletter-category" className="text-xs uppercase tracking-widest">Category · Optional</Label>
              <Input id="newsletter-category" aria-invalid={Boolean(newsletterIssueFor('category'))} aria-describedby="newsletter-category-error" value={parsedData.category || ''} onChange={e => updateDataField('category', e.target.value)} className="bg-muted/30" />
              <p id="newsletter-category-error" aria-live="polite" className="text-xs text-destructive">{newsletterIssueFor('category')}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="newsletter-excerpt" className="text-xs uppercase tracking-widest">Excerpt · Optional</Label>
              <Textarea id="newsletter-excerpt" aria-invalid={Boolean(newsletterIssueFor('excerpt'))} aria-describedby="newsletter-excerpt-error" value={parsedData.excerpt || ''} onChange={e => updateDataField('excerpt', e.target.value)} className="bg-muted/30" />
              <p id="newsletter-excerpt-error" aria-live="polite" className="text-xs text-destructive">{newsletterIssueFor('excerpt')}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="newsletter-url" className="text-xs uppercase tracking-widest">External URL · Optional</Label>
              <Input id="newsletter-url" aria-invalid={Boolean(newsletterIssueFor('url'))} aria-describedby="newsletter-url-error" value={parsedData.url || ''} onChange={e => updateDataField('url', e.target.value)} className="bg-muted/30" />
              <p id="newsletter-url-error" aria-live="polite" className="text-xs text-destructive">{newsletterIssueFor('url')}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="newsletter-cover" className="text-xs uppercase tracking-widest">Cover Image · Optional</Label>
              <AssetPicker
                id="newsletter-cover"
                error={newsletterIssueFor('image')}
                describedBy="newsletter-cover-help newsletter-cover-error"
                value={parsedData.image}
                onChange={(v) => updateDataField('image', v)}
              />
              <p id="newsletter-cover-help" className="text-xs text-muted-foreground">Select an editorial cover or upload an image you have permission to use. A chosen cover is not verified source evidence.</p>
              <p id="newsletter-cover-error" aria-live="polite" className="text-xs text-destructive">{newsletterIssueFor('image')}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="newsletter-author" className="text-xs uppercase tracking-widest">Author Name · Optional</Label>
                <Input
                  id="newsletter-author"
                  aria-invalid={Boolean(newsletterIssueFor('author.name'))}
                  aria-describedby="newsletter-author-error"
                  value={parsedData.author?.name || ''}
                  onChange={e => updateDataField('author', { ...parsedData.author, name: e.target.value })}
                  className="bg-muted/30"
                />
                <p id="newsletter-author-error" aria-live="polite" className="text-xs text-destructive">{newsletterIssueFor('author.name')}</p>
                <p className="text-xs text-muted-foreground">Use the visible source byline. Leave it empty if unknown; do not guess.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="newsletter-author.image" className="text-xs uppercase tracking-widest">Author Image · Optional</Label>
                <AssetPicker id="newsletter-author.image" error={newsletterIssueFor('author.image')} describedBy="newsletter-author-image-error" value={parsedData.author?.image} onChange={(v) => updateDataField('author', { ...parsedData.author, image: v })} />
                <p id="newsletter-author-image-error" aria-live="polite" className="text-xs text-destructive">{newsletterIssueFor('author.image')}</p>
              </div>
            </div>
          </div>
        );
      case 'masterclasses':
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">Detail Title</Label>
              <Input value={parsedData.detailTitle || ''} onChange={e => updateDataField('detailTitle', e.target.value)} className="bg-muted/30" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">Excerpt</Label>
              <Textarea value={parsedData.excerpt || ''} onChange={e => updateDataField('excerpt', e.target.value)} className="bg-muted/30" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">Framing</Label>
              <Textarea value={parsedData.framing || ''} onChange={e => updateDataField('framing', e.target.value)} className="bg-muted/30 h-24" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">Implications</Label>
              <Textarea value={parsedData.implications || ''} onChange={e => updateDataField('implications', e.target.value)} className="bg-muted/30 h-24" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">External Link</Label>
              <Input value={parsedData.url || ''} onChange={e => updateDataField('url', e.target.value)} className="bg-muted/30" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-widest">Cover Image</Label>
                <AssetPicker value={parsedData.image} onChange={(v) => updateDataField('image', v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-widest">Author Name</Label>
                <Input value={parsedData.authorName || ''} onChange={e => { updateDataField('authorName', e.target.value); updateDataField('author', { ...parsedData.author, name: e.target.value }); }} className="bg-muted/30" />
              </div>
            </div>
          </div>
        );
      case 'talks':
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">Topic</Label>
              <Input value={parsedData.topic || ''} onChange={e => updateDataField('topic', e.target.value)} className="bg-muted/30" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">YouTube URL or ID</Label>
              <div className="flex gap-2 items-center">
                <Link2 className="w-4 h-4 text-muted-foreground" />
                <Input placeholder="e.g. dQw4w9WgXcQ or https://youtube.com/..." value={parsedData.id || ''} onChange={e => updateDataField('id', e.target.value)} className="bg-muted/30" />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Will be automatically normalized to ID upon save.</p>
            </div>
          </div>
        );
      case 'contributors': {
        const contributions = Array.isArray(parsedData.contributions)
          ? parsedData.contributions
          : Array.isArray(parsedData.articles)
            ? parsedData.articles.map((article: any) => ({
                title: article.title || '',
                url: article.url || '',
                description: article.excerpt || '',
              }))
            : [];

        const updateContribution = (index: number, field: string, value: string) => {
          updateDataField('contributions', contributions.map((contribution: any, contributionIndex: number) =>
            contributionIndex === index ? { ...contribution, [field]: value } : contribution
          ));
        };

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-widest">Name</Label>
                <Input
                  value={parsedData.name || ''}
                  onChange={e => {
                    updateDataField('name', e.target.value);
                    setValue('title', e.target.value, { shouldDirty: true });
                  }}
                  className="bg-muted/30"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-widest">Role</Label>
                <Input value={parsedData.role || ''} onChange={e => updateDataField('role', e.target.value)} className="bg-muted/30" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">Group</Label>
              <select
                value={parsedData.group || ''}
                onChange={e => updateDataField('group', e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm bg-muted/30 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Select Group...</option>
                <option value="Core Team">Core Team</option>
                <option value="Contributors">Contributors</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="contributor-linkedin-url" className="text-xs uppercase tracking-widest">LinkedIn Profile URL</Label>
              <Input
                id="contributor-linkedin-url"
                type="url"
                placeholder="https://www.linkedin.com/in/..."
                value={parsedData.linkedinUrl || ''}
                onChange={e => updateDataField('linkedinUrl', e.target.value)}
                className="bg-muted/30"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">Image</Label>
              <AssetPicker value={parsedData.image} onChange={(v) => updateDataField('image', v)} />
            </div>
            <div className="space-y-3 border-t border-border pt-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-xs uppercase tracking-widest">Contributions</Label>
                  <p className="mt-1 text-[10px] text-muted-foreground">Shown on the contributor profile page.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateDataField('contributions', [...contributions, { title: '', url: '', description: '' }])}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" /> Add
                </Button>
              </div>
              {contributions.length === 0 ? (
                <div className="border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
                  No contributions added yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {contributions.map((contribution: any, index: number) => (
                    <div key={index} className="space-y-3 border border-border bg-muted/15 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          Contribution {index + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove contribution ${index + 1}`}
                          onClick={() => updateDataField('contributions', contributions.filter((_: any, contributionIndex: number) => contributionIndex !== index))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        placeholder="Contribution title"
                        value={contribution.title || ''}
                        onChange={event => updateContribution(index, 'title', event.target.value)}
                        className="bg-card"
                      />
                      <Input
                        type="url"
                        placeholder="https://..."
                        value={contribution.url || ''}
                        onChange={event => updateContribution(index, 'url', event.target.value)}
                        className="bg-card"
                      />
                      <Textarea
                        placeholder="Short description (optional)"
                        value={contribution.description || ''}
                        onChange={event => updateContribution(index, 'description', event.target.value)}
                        className="min-h-20 bg-card"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Switch
                id="isPlaceholder"
                checked={parsedData.isPlaceholder || false}
                onCheckedChange={c => { updateDataField('isPlaceholder', c); updateDataField('isNamedProspect', c); }}
              />
              <Label htmlFor="isPlaceholder">Named Prospect / In Development (No Articles Yet)</Label>
            </div>
          </div>
        );
      }
      case 'communities':
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">Name</Label>
              <Input value={parsedData.name || ''} onChange={e => updateDataField('name', e.target.value)} className="bg-muted/30" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">Description</Label>
              <Textarea value={parsedData.desc || ''} onChange={e => updateDataField('desc', e.target.value)} className="bg-muted/30" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">Ecosystem URL</Label>
              <Input value={parsedData.url || ''} onChange={e => updateDataField('url', e.target.value)} className="bg-muted/30" />
            </div>
          </div>
        );
      case 'events':
        const eventImages = Array.isArray(parsedData.images) ? parsedData.images : [];
        return (
          <div className="space-y-4">
            <div className="rounded-sm border border-border bg-muted/20 p-4">
              <p className="text-xs font-medium text-foreground">Event details are optional for drafts and publication.</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Add only known facts. Any dates, links, or timezones you supply must be valid; missing information stays unconfirmed.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-widest">Start date, time & offset · Optional</Label>
                <Input
                  placeholder="2026-09-17T18:30:00+04:00"
                  value={parsedData.startAt || ''}
                  onChange={e => updateDataField('startAt', e.target.value)}
                  className="bg-muted/30 font-mono text-xs"
                />
                {issueFor('startAt') && <p className="text-xs text-destructive">{issueFor('startAt')}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-widest">End date, time & offset · Optional</Label>
                <Input
                  placeholder="2026-09-17T20:00:00+04:00"
                  value={parsedData.endAt || ''}
                  onChange={e => updateDataField('endAt', e.target.value)}
                  className="bg-muted/30 font-mono text-xs"
                />
                {issueFor('endAt') && <p className="text-xs text-destructive">{issueFor('endAt')}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-widest">Timezone · Optional</Label>
                <Input placeholder="e.g. Asia/Dubai" value={parsedData.timezone || ''} onChange={e => updateDataField('timezone', e.target.value)} className="bg-muted/30" />
                {issueFor('timezone') && <p className="text-xs text-destructive">{issueFor('timezone')}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-widest">Format · Optional</Label>
                <select
                  value={parsedData.format || ''}
                  onChange={e => updateDataField('format', e.target.value)}
                  className="w-full h-10 px-3 py-2 text-sm bg-muted/30 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select Format...</option>
                  <option value="in-person">In-Person</option>
                  <option value="online">Online</option>
                  <option value="hybrid">Hybrid</option>
                </select>
                {issueFor('format') && <p className="text-xs text-destructive">{issueFor('format')}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">Location · Optional</Label>
              <Input placeholder="Venue name or city" value={parsedData.location || ''} onChange={e => updateDataField('location', e.target.value)} className="bg-muted/30" />
              {issueFor('location') && <p className="text-xs text-destructive">{issueFor('location')}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">Description · Optional</Label>
              <Textarea value={parsedData.desc || ''} onChange={e => updateDataField('desc', e.target.value)} className="bg-muted/30" />
              {issueFor('desc') && <p className="text-xs text-destructive">{issueFor('desc')}</p>}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-widest">Verified source URL · Optional</Label>
                <Input value={parsedData.sourceUrl || ''} onChange={e => updateDataField('sourceUrl', e.target.value)} className="bg-muted/30" />
                {issueFor('sourceUrl') && <p className="text-xs text-destructive">{issueFor('sourceUrl')}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-widest">Registration URL · Optional</Label>
                <Input value={parsedData.registrationUrl || ''} onChange={e => updateDataField('registrationUrl', e.target.value)} className="bg-muted/30" />
                {issueFor('registrationUrl') && <p className="text-xs text-destructive">{issueFor('registrationUrl')}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest">Event image · Optional</Label>
              {eventImages[0] && (
                <div className="flex items-start gap-3 border border-border bg-muted/20 p-3">
                  <img src={eventImages[0]} alt="Selected event artwork" className="h-24 w-36 bg-card object-contain" />
                  <Button type="button" variant="outline" size="sm" onClick={() => updateDataField('images', eventImages.slice(1))}>
                    Remove image
                  </Button>
                </div>
              )}
              <AssetPicker
                value={eventImages[0] || ''}
                onChange={(value) => updateDataField('images', [value, ...eventImages.slice(1)])}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={generateEventImageMutation.isPending || !String(watch('title') || '').trim()}
                  onClick={() => generateEventImageMutation.mutate({
                    title: watch('title'),
                    description: parsedData.desc,
                    location: parsedData.location,
                    format: parsedData.format,
                  }, {
                    onSuccess: ({ data }) => {
                      updateDataFields({
                        images: [data.url, ...eventImages.slice(1)],
                      });
                    },
                  })}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {generateEventImageMutation.isPending ? 'Generating…' : 'Generate representative artwork'}
                </Button>
              </div>
              <details className="border border-border/60 p-3">
                <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-muted-foreground">Advanced: use an image URL</summary>
                <Input
                  type="url"
                  placeholder="https://organizer.example/event-image.jpg"
                  value={eventImages[0] || ''}
                  onChange={e => updateDataField('images', e.target.value ? [e.target.value, ...eventImages.slice(1)] : eventImages.slice(1))}
                  className="mt-3 bg-muted/30"
                />
              </details>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                You can publish without an image; the public page will use its no-image layout. Generated artwork is representative and never treated as documentary event photography.
              </p>
            </div>
          </div>
        );
      case 'future-work':
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">Name</Label>
              <Input value={parsedData.name || ''} onChange={e => updateDataField('name', e.target.value)} className="bg-muted/30" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">Description</Label>
              <Textarea value={parsedData.desc || ''} onChange={e => updateDataField('desc', e.target.value)} className="bg-muted/30" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-widest">Cover Image</Label>
              <AssetPicker value={parsedData.img} onChange={(v) => updateDataField('img', v)} />
            </div>
            <div className="space-y-1 pt-2">
              <Label className="text-xs uppercase tracking-widest text-primary">Sections Content</Label>
              <p className="text-[10px] text-muted-foreground mb-2">Edit the 'sections' array in the raw JSON editor below.</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const showAdvancedJson = ['future-work'].includes(collection)
    || (collection === 'events' && Boolean(parsedData.year) && !parsedData.startAt)
    || !['newsletters', 'masterclasses', 'talks', 'contributors', 'communities', 'events'].includes(collection);

  const getPreviewUrl = () => {
    if (!item) return null;
    switch (collection) {
      case 'masterclasses': return `/masterclass-series/${item.slug}`;
      case 'future-work': return `/future-of-work/${item.slug}`;
      case 'contributors': return `/contributors/${item.slug}`;
      case 'events': return `/events/${item.slug}`;
      case 'newsletters': return parsedData.url;
      case 'communities': return parsedData.url;
      default: return null;
    }
  };

  const previewUrl = getPreviewUrl();
  const eventStartTime = typeof parsedData.startAt === 'string' ? new Date(parsedData.startAt).getTime() : NaN;
  const eventEndTime = typeof parsedData.endAt === 'string' ? new Date(parsedData.endAt).getTime() : NaN;
  const canMarkEventEnded = collection === 'events'
    && Boolean(item)
    && Number.isFinite(eventStartTime)
    && eventStartTime <= Date.now()
    && (
      Number.isFinite(eventEndTime)
        ? eventEndTime > Date.now()
        : parsedData.completionMode === 'manual'
    );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-w-0 flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/80 p-4">
        <h2 className="text-xl font-display">
          {item ? 'Edit Item' : `New ${collection}`}
        </h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 h-8 border border-border bg-background hover:bg-muted text-xs uppercase tracking-widest transition-colors"
            >
              Preview
            </a>
          )}
          {item && onPublishToggle && collection !== 'events' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPublishToggle}
              className={`text-xs uppercase tracking-widest border-border hover:bg-muted ${item.status === 'published' ? 'text-amber-500' : 'text-green-500'}`}
            >
              {item.status === 'published' ? 'Unpublish' : 'Publish'}
            </Button>
          )}
          {canMarkEventEnded && item && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={markEventEndedMutation.isPending}
              onClick={() => {
                if (!window.confirm('Mark this event as ended now? It will move to the Ended section automatically.')) return;
                markEventEndedMutation.mutate({ id: item.id, expectedVersion: item.version });
              }}
              className="text-xs uppercase tracking-widest border-border text-amber-400 hover:bg-muted"
            >
              <Clock3 className="mr-2 h-4 w-4" />
              {markEventEndedMutation.isPending ? 'Ending…' : 'Mark ended'}
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-background/50">
        <AiAutofillPanel
          collection={collection}
          currentDraft={{
            title: watch('title'),
            slug: watch('slug'),
            data: parsedData
          }}
          onApply={handleAiApply}
          onApplyMedia={(field, url) => {
            if (field === 'cover') updateCover(url);
            else if (collection === 'contributors') updateDataField('image', url);
            else updateDataField('author', { ...parsedData.author, image: url });
          }}
        />

        <EditorCoverTools
          collection={collection}
          title={watch('title')}
          description={parsedData.excerpt || parsedData.desc || parsedData.framing}
          image={coverImage}
          onChange={updateCover}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest font-semibold text-primary">Title · Required</Label>
            <Input {...register("title")} className="text-lg font-medium bg-card" />
            {errors.title && <p className="text-destructive text-xs">{errors.title.message as string}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest font-semibold text-primary">Slug · Required</Label>
            <Input {...register("slug")} className="bg-card font-mono text-sm" />
            {errors.slug && <p className="text-destructive text-xs">{errors.slug.message as string}</p>}
          </div>
        </div>

        <div className="space-y-6 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground">Only Title and Slug are required. Links, cover photos, bylines, and other details can stay empty. Supplied details must be valid and supported by your source.</p>
          <h3 className="text-sm uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-2">
            <span className="w-4 h-[1px] bg-border block"></span> Fields for {collection}
          </h3>
          {saveIssues.length > 0 && (
            <div role="alert" className="flex items-start gap-3 border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-medium text-foreground">Check the details you supplied. Optional details can stay empty.</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {saveIssues.map((issue, index) => <li key={`${issue.path?.join('.')}-${index}`}>{issue.path?.join('.')}: {issue.message}</li>)}
                </ul>
              </div>
            </div>
          )}
          {renderCollectionSpecificFields()}
        </div>

        <div className="space-y-4 pt-6 border-t border-border">
          <div className="flex items-center justify-between">
             <h3 className="text-sm uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-2">
               <span className="w-4 h-[1px] bg-border block"></span> Raw Data (JSON)
             </h3>
             {!showAdvancedJson && <span className="text-[10px] uppercase tracking-widest bg-muted/50 px-2 py-1">Advanced</span>}
          </div>

          <div className={!showAdvancedJson ? "opacity-50 hover:opacity-100 transition-opacity" : ""}>
             <Controller
               name="data"
               control={control}
               render={({ field }) => (
                 <Textarea
                   {...field}
                   className="font-mono text-xs h-64 bg-card whitespace-pre"
                   spellCheck={false}
                 />
               )}
             />
             {showAdvancedJson && <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-widest">Note: Ensure valid JSON structure before saving.</p>}
          </div>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-3 border-t border-border bg-card/80 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {!item && collection !== 'events' && (
             <div className="flex items-center gap-2 mr-4">
               <Label htmlFor="create-status" className="text-xs uppercase tracking-widest cursor-pointer">Publish immediately</Label>
               <Switch
                 id="create-status"
                 checked={watch('status') === 'published'}
                 onCheckedChange={(checked) => setValue('status', checked ? 'published' : 'draft')}
               />
             </div>
          )}
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          {newsletterIssues.length > 0 && (
            <p id="newsletter-save-help" role="status" className="max-w-xs self-center text-xs text-destructive">
              Check the supplied values: {newsletterIssues.map(issue => newsletterFieldLabels[issue.path.join('.')]).join(', ')}. These fields can also be left empty.
            </p>
          )}
            <Button type="button" variant="outline" onClick={onClose} className="w-full text-xs uppercase tracking-widest sm:w-auto">
            Cancel
          </Button>
          {collection === 'events' ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={createMutation.isPending || updateMutation.isPending}
                onClick={handleSubmit((data) => onSubmit({ ...data, status: 'draft' }))}
                className="w-full text-xs uppercase tracking-widest sm:w-auto"
              >
                <Save className="mr-2 h-4 w-4" /> Save draft
              </Button>
              <Button
                type="button"
                disabled={createMutation.isPending || updateMutation.isPending}
                onClick={handleSubmit((data) => onSubmit({ ...data, status: 'published' }))}
                className="w-full text-xs uppercase tracking-widest sm:w-auto"
              >
                {item?.status === 'published' ? 'Save published event' : 'Publish event'}
              </Button>
            </>
          ) : (
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || newsletterIssues.length > 0} aria-describedby={newsletterIssues.length > 0 ? 'newsletter-save-help' : undefined} className="w-full text-xs uppercase tracking-widest min-w-[120px] sm:w-auto">
              {(createMutation.isPending || updateMutation.isPending) ? (
                <span className="animate-pulse">Saving...</span>
              ) : (
                <><Save className="w-4 h-4 mr-2" /> Save Changes</>
              )}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}