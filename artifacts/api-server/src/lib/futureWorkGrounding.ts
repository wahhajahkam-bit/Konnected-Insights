import { z } from "zod/v4";

export type EvidencePassage = { id: string; text: string };
// Keep byte-for-byte slices of the fetched excerpt, including Unicode punctuation.
// The extractor flattens HTML paragraphs; sentence-sized windows remain selectable.
export function evidencePassages(excerpt: string): EvidencePassage[] {
  const passages: EvidencePassage[] = [];
  let offset = 0;
  while (offset < excerpt.length) {
    const window = excerpt.slice(offset, offset + 600);
    let length = window.length;
    if (offset + length < excerpt.length) {
      const boundaries = [...window.matchAll(/[.!?](?:["”’])?\s+/g)];
      const last = boundaries.at(-1);
      const sentenceEnd = last ? last.index! + last[0].length : 0;
      length = sentenceEnd >= 80 ? sentenceEnd : Math.max(window.lastIndexOf(" "), 1);
    }
    const text = excerpt.slice(offset, offset + length).trim();
    if (text.length >= 20) passages.push({ id: `P${passages.length + 1}`, text });
    offset += length;
  }
  return passages;
}
export function selectedPassages(passages: EvidencePassage[], ids: string[]) {
  if (!ids.length || ids.length > 4 || new Set(ids).size !== ids.length) throw new Error("Invalid supporting passage selection");
  return ids.map(id => {
    const passage = passages.find(p => p.id === id);
    if (!passage) throw new Error(`Unknown supporting passage ID: ${id}`);
    return passage;
  });
}
export const supportReviewSchema = z.object({
  relevant: z.boolean(),
  horizonAppropriate: z.boolean(),
  rationale: z.string().min(10).max(1500),
  claims: z.array(z.object({
    id: z.string(), supported: z.boolean(),
    passageIds: z.array(z.string()).max(4),
    reason: z.string().min(10).max(800),
  })),
});
export function enforceSupportReview(review: z.infer<typeof supportReviewSchema>, claimIds: string[], passages: EvidencePassage[]) {
  if (!review.relevant || !review.horizonAppropriate) throw new Error(`Evidence support review rejected relevance/horizon: ${review.rationale}`);
  if (review.claims.length !== claimIds.length || new Set(review.claims.map(c => c.id)).size !== claimIds.length) {
    throw new Error("Evidence support review omitted or duplicated claims");
  }
  for (const id of claimIds) {
    const claim = review.claims.find(c => c.id === id);
    if (!claim?.supported || !claim.passageIds.length || claim.passageIds.some(id => !passages.some(p => p.id === id))) {
      throw new Error(`Evidence does not support ${id}: ${claim?.reason ?? "missing review"}`);
    }
  }
}