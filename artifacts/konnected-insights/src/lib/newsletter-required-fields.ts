import { z } from 'zod';

export const newsletterFieldLabels: Record<string, string> = {
  category: 'Category',
  excerpt: 'Excerpt',
  url: 'External URL',
  image: 'Cover Image',
  'author.name': 'Author Name',
  'author.image': 'Author Image',
};

const httpUrl = z.string().url().regex(/^https?:\/\//i);
const isMediaUrl = (value: unknown) => typeof value === 'string'
  && (/^https?:\/\/\S+$/i.test(value) || /^\/(?!\/)\S+/.test(value));

type NewsletterFieldIssue = {
  path: Array<string | number>;
  message: string;
};

// Metadata is optional. Validate supplied values without inventing missing facts.
// The server remains responsible for validating the complete write payload.
export function newsletterRequiredFieldIssues(data: unknown): NewsletterFieldIssue[] {
  const draft = data && typeof data === 'object'
    ? data as Record<string, unknown>
    : {};
  const author = draft.author && typeof draft.author === 'object'
    ? draft.author as Record<string, unknown>
    : {};
  const issues: NewsletterFieldIssue[] = [];

  if (draft.url && !httpUrl.safeParse(draft.url).success && String(draft.url).trim()) {
    issues.push({ path: ['url'], message: 'Use a valid absolute HTTP(S) newsletter URL, or leave it empty.' });
  }

  if (draft.image && String(draft.image).trim() && !isMediaUrl(draft.image)) {
    issues.push({
      path: ['image'],
      message: 'Choose or upload a cover image with a valid image URL or site path.',
    });
  }

  if (author.image && String(author.image).trim() && !isMediaUrl(author.image)) {
    issues.push({
      path: ['author', 'image'],
      message: 'Author Image is optional. Choose a valid image or remove this field from the advanced JSON.',
    });
  }
  return issues;
}