import { CoverPhoto } from '@/components/cover-photo';

const generatedCommunities = new Set([
  'the-konsalidon-ecosystem', 'delivery-ecosystem', 'dealflow-ecosystem',
  'frontier-ecosystem', 'story-ecosystem', 'people-ecosystem',
  'capital-ecosystem', 'foresight-ecosystem', 'trust-ecosystem',
  'sourcing-ecosystem', 'industry-ecosystem', 'longevity-ecosystem',
  'growth-ecosystem',
]);

/** Editorial uploads take priority over the bundled illustrative covers. */
export function CommunityCover({ slug, name, image, imageProvenance, className = '' }: {
  slug: string;
  name: string;
  image?: string;
  imageProvenance?: string;
  className?: string;
}) {
  const hasEditorialImage = Boolean(image?.trim());
  const hasGeneratedCover = generatedCommunities.has(slug);
  const src = hasEditorialImage ? image : hasGeneratedCover
    ? `${import.meta.env.BASE_URL}communities/${slug}.jpg`
    : undefined;
  return <CoverPhoto
    src={src}
    alt={`${name} — illustrative community cover`}
    generated={hasEditorialImage ? imageProvenance === 'ai-generated-representative-artwork' : hasGeneratedCover}
    className={className}
  />;
}