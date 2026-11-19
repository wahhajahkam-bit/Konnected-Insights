import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import type { FwFunction } from '@/lib/api-future-work';

const generatedCovers: Readonly<Record<string, string>> = {
  finance: 'finance',
  marketing: 'marketing',
  hr: 'hr',
  operations: 'operations',
  sales: 'sales',
  'technology-it': 'technology-it',
  grc: 'grc',
};

export function FunctionCardCover({ fn }: { fn: FwFunction }) {
  const editorialSource = fn.presentation?.heroCoverUrl?.trim();
  const generated = Object.hasOwn(generatedCovers, fn.slug) ? generatedCovers[fn.slug] : undefined;
  const src = editorialSource || (generated
    ? `${import.meta.env.BASE_URL}images/future-work/${generated}.webp`
    : undefined);

  // Remount when the source changes so a previous failure cannot hide a new cover.
  return <CoverImage key={src || 'missing'} src={src} alt={editorialSource ? fn.presentation?.heroAlt || '' : ''} />;
}

function CoverImage({ src, alt }: { src?: string; alt: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed' | 'missing'>(src ? 'loading' : 'missing');

  return (
    <div
      data-testid="function-card-cover"
      data-state={state}
      className="relative aspect-video w-full shrink-0 overflow-hidden border-b border-border bg-muted"
    >
      <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-background/60">
        <ImageIcon className="h-8 w-8 text-muted-foreground/30" strokeWidth={1} />
      </div>
      {src && state !== 'failed' && (
        <img
          src={src}
          alt={alt}
          width={960}
          height={540}
          loading="lazy"
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
          className={`absolute inset-0 h-full w-full object-cover object-center ${state === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  );
}