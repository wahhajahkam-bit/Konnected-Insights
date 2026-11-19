export type ContributorContribution = {
  title: string;
  url?: string;
  description?: string;
  category?: string;
};

type LegacyArticle = {
  title: string;
  url?: string;
  excerpt?: string;
  category?: string;
};

const EDITORIAL_CUTOUT_SLUGS = new Set([
  'savi',
  'vivaan',
  'varun-malik',
  'raj-vattikuti',
  'vanessa-ugatti',
  'mads-winther',
  'piers-thurston',
  'herve-marchet',
  'javier-velasquez',
  'anne-marie-thodsen',
  'rajiv-narang',
]);

const SUPPLIED_CORE_TEAM_PORTRAITS = new Set([
  'savi',
  'vivaan',
  'varun-malik',
]);

export const VERIFIED_LINKEDIN_PROFILES: Record<string, string> = {
  'varun-malik': 'https://www.linkedin.com/in/varunmalik2017',
  'raj-vattikuti': 'https://www.linkedin.com/in/raj-vattikuti-071993122',
  'vanessa-ugatti': 'https://www.linkedin.com/in/vanessa-ugatti-legal-pricing',
  'mads-winther': 'https://www.linkedin.com/in/mads-winther-19b8811',
  'piers-thurston': 'https://www.linkedin.com/in/piersthurston',
  'herve-marchet': 'https://www.linkedin.com/in/hervemarchet',
  'javier-velasquez': 'https://www.linkedin.com/in/javier-velasquez-game',
  'anne-marie-thodsen': 'https://www.linkedin.com/in/annemariedrud',
  'rajiv-narang': 'https://www.linkedin.com/in/rajivnarangofficial',
};

const VERIFIED_CONTRIBUTOR_NAMES: Record<string, string> = {
  'varun-malik': 'Varun Malik',
  'raj-vattikuti': 'Raj Vattikuti',
  'vanessa-ugatti': 'Vanessa Ugatti',
  'mads-winther': 'Mads Winther',
  'piers-thurston': 'Piers Thurston',
  'herve-marchet': 'Herve Marchet',
  'javier-velasquez': 'Javier Velasquez',
  'anne-marie-thodsen': 'Anne Marie Thodsen',
  'rajiv-narang': 'Rajiv Narang',
};

function normalizedIdentity(value?: string) {
  return value?.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function validLinkedInProfileUrl(value?: string) {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLocaleLowerCase();
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    if (hostname !== 'linkedin.com' && !hostname.endsWith('.linkedin.com')) return undefined;
    if (!/^\/in\/[^/]+\/?$/i.test(url.pathname)) return undefined;
    return value.trim();
  } catch {
    return undefined;
  }
}

export function resolveContributorLinkedIn({
  slug,
  name,
  linkedinUrl,
}: {
  slug: string;
  name?: string;
  linkedinUrl?: string;
}) {
  const explicitUrl = validLinkedInProfileUrl(linkedinUrl);
  if (explicitUrl) return explicitUrl;

  const verifiedName = VERIFIED_CONTRIBUTOR_NAMES[slug];
  if (!verifiedName || normalizedIdentity(name) !== normalizedIdentity(verifiedName)) return undefined;
  return VERIFIED_LINKEDIN_PROFILES[slug];
}

export function resolveContributorPortrait({
  slug,
  image,
  isPlaceholder,
}: {
  slug: string;
  image?: string;
  isPlaceholder?: boolean;
}) {
  if (SUPPLIED_CORE_TEAM_PORTRAITS.has(slug)) return `/editorial/portraits/${slug}-cutout.png`;
  if (image && !image.startsWith('/original/')) return image;
  if (EDITORIAL_CUTOUT_SLUGS.has(slug)) return `/editorial/portraits/${slug}.png`;
  if (isPlaceholder) return undefined;
  return image;
}

export function getContributorContributions(
  contributions?: ContributorContribution[],
  articles?: LegacyArticle[],
): ContributorContribution[] {
  if (Array.isArray(contributions) && contributions.length > 0) return contributions;
  if (!Array.isArray(articles)) return [];

  return articles.map(article => ({
    title: article.title,
    url: article.url,
    description: article.excerpt,
    category: article.category,
  }));
}