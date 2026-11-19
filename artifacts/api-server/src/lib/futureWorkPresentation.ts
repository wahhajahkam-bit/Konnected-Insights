import { z } from "zod/v4";

// Presentation is plain editorial framing, never an evidence/version payload.
// Match editorial media conventions (http(s) or root-relative stored media),
// rejecting credentials and browser URL-normalization escape sequences.
const coverUrl = z.string().trim().max(2048).refine(value => {
  if (!value || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value)) return true;
  try {
    const url = new URL(value);
    return /^https?:\/\//i.test(value) && !url.username && !url.password;
  } catch { return false; }
}, "Cover must be an absolute http(s) URL or root-relative media path");

export const futureWorkPresentation = z.object({
  heroCoverUrl: coverUrl.optional(),
  heroAlt: z.string().trim().max(300).optional(),
  heroCredit: z.string().trim().max(300).optional(),
  shortIntroduction: z.string().trim().max(1000).optional(),
  sectionIntroductions: z.object({
    overview: z.string().trim().max(600).optional(),
    outlook: z.string().trim().max(600).optional(),
    skills: z.string().trim().max(600).optional(),
    news: z.string().trim().max(600).optional(),
    programs: z.string().trim().max(600).optional(),
    sources: z.string().trim().max(600).optional(),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.heroCoverUrl && !value.heroAlt) {
    ctx.addIssue({ code: "custom", path: ["heroAlt"], message: "Descriptive alt text is required when a hero cover is set" });
  }
});