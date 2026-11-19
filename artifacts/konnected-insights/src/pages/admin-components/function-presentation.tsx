import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { AssetPicker } from './editor-form';
import { functionIntroduction } from '@/lib/future-work-introduction';
import type { FwFunction } from '@/lib/api-future-work';

export type FunctionPresentation = {
  heroCoverUrl?: string;
  heroAlt?: string;
  heroCredit?: string;
  shortIntroduction?: string;
  sectionIntroductions?: Partial<Record<'overview' | 'outlook' | 'skills' | 'news' | 'programs' | 'sources', string>>;
};

export function FunctionPresentationFields({ value, functionDetails, onChange }: {
  value: FunctionPresentation;
  functionDetails: Pick<FwFunction, 'name' | 'slug' | 'description'>;
  onChange: (value: FunctionPresentation) => void;
}) {
  const introduction = functionIntroduction({ ...functionDetails, presentation: value });
  const setCover = (heroCoverUrl: string) => {
    const { heroCoverUrl: _previousCover, ...rest } = value;
    onChange(heroCoverUrl ? { ...rest, heroCoverUrl } : rest);
  };
  return <fieldset className="min-w-0 space-y-4 border-t border-border pt-4">
    <legend className="px-1 font-medium">Page presentation · optional</legend>
    <p className="text-xs text-muted-foreground">Introductions guide readers, not research claims. Evidence-backed outlooks and skills remain in the versioned editorial workflow. Use only imagery you have permission to publish and record its accurate credit.</p>
    <div><Label htmlFor="function-cover">Hero cover</Label><AssetPicker id="function-cover" value={value.heroCoverUrl || ''} onChange={setCover} />
      {value.heroCoverUrl && <Button type="button" variant="ghost" size="sm" onClick={() => setCover('')}>Remove cover</Button>}
    </div>
    <div><Label htmlFor="function-alt">Descriptive image alt text</Label><Input id="function-alt" value={value.heroAlt || ''} onChange={event => onChange({ ...value, heroAlt: event.target.value })} /></div>
    <div><Label htmlFor="function-credit">Image credit / provenance</Label><Input id="function-credit" value={value.heroCredit || ''} onChange={event => onChange({ ...value, heroCredit: event.target.value })} /></div>
    <div><Label htmlFor="function-intro">Short introduction</Label><Textarea id="function-intro" value={value.shortIntroduction || ''} onChange={event => onChange({ ...value, shortIntroduction: event.target.value })} /></div>
    <details><summary className="cursor-pointer text-sm font-medium">Section introductions</summary>
      <div className="mt-3 space-y-3">{([
        ['overview', 'Overview'],
        ['news', 'Recent News · 01'],
        ['programs', 'Recommended Programs · 02'],
        ['outlook', 'Outlook · 03'],
        ['skills', 'Implications · 04'],
        ['sources', 'Sources · 05'],
      ] as const).map(([section, label]) => <div key={section}>
        <Label htmlFor={`function-section-${section}`}>{label}</Label>
        <Textarea id={`function-section-${section}`} value={value.sectionIntroductions?.[section] || ''} onChange={event => onChange({ ...value, sectionIntroductions: { ...value.sectionIntroductions, [section]: event.target.value } })} />
      </div>)}</div>
    </details>
    <section aria-labelledby="function-header-preview-title" className="min-w-0 rounded-lg border border-border p-4 space-y-4" data-testid="function-header-preview">
      <div className="space-y-2">
        <h4 id="function-header-preview-title" className="text-sm font-semibold">Header introduction preview · read-only</h4>
        <p className="text-xs text-muted-foreground">Updates as you edit, before saving. Short introduction supplies the subheading when it contains displayable copy. Overview (under Section introductions) supplies supporting copy; if no distinct overview remains, Description is used, then function-specific fallback framing. When Short introduction is blank or suppressed, the first remaining paragraph becomes the subheading.</p>
        <p className="text-xs text-muted-foreground">Repeated sentences and generic boilerplate are hidden in the public header only. Your saved fields are not changed. Long copy is shown in full below.</p>
      </div>
      <div className="space-y-5">
        {introduction.map((paragraph, index) => <div key={paragraph} className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{index === 0 ? 'Subheading' : 'Supporting copy'}</p>
          <p className={`${index === 0 ? 'text-xl' : 'text-lg'} text-muted-foreground leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]`}>{paragraph}</p>
        </div>)}
        {introduction.length === 1 && <p className="text-xs text-muted-foreground">No separate supporting copy remains after duplicate suppression and fallback selection.</p>}
      </div>
    </section>
  </fieldset>;
}