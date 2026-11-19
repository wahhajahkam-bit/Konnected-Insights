import { useEffect, useState } from 'react';

export function CoverPhoto({ src, alt = '', className = '', fit = 'cover', omitWhenUnavailable = false }: {
  src?: string; alt?: string; className?: string; generated?: boolean; fit?: 'cover' | 'contain'; omitWhenUnavailable?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const source = typeof src === 'string' ? src.trim() : undefined;
  useEffect(() => setFailed(false), [src]);

  if (omitWhenUnavailable && (!source || failed)) return null;

  return (
    <div data-testid="cover-photo" className={`relative overflow-hidden bg-muted ${fit === 'contain' ? 'flex flex-col' : ''} ${className}`}>
      {source && !failed ? (
        <img src={source} alt={alt} onError={() => setFailed(true)} className={fit === 'contain' ? 'min-h-0 flex-1 w-full object-contain object-center' : 'h-full w-full object-cover'} />
      ) : (
        <div className="flex h-full min-h-32 items-center justify-center px-6 text-xs uppercase tracking-widest text-muted-foreground">No cover photo</div>
      )}
    </div>
  );
}