import { editorialCollectionSchema } from "@workspace/db/schema";
import { z } from "zod/v4";

const evidenceScreenshotUrl = z.string().regex(/^\/api\/storage\/evidence\/drive\/[a-zA-Z0-9_-]{10,200}$/);

// Base64 expands by roughly 4/3; 30 MiB of file bytes leaves ample room for
// text and JSON below the upstream 50 MB request limit.
export const MAX_EDITORIAL_SCREENSHOT_BYTES = 30 * 1024 * 1024;

export class EditorialScreenshotInputError extends Error {
  constructor() {
    super("Attached screenshots exceed 30 MB in total. Remove some images or upload smaller screenshots.");
    this.name = "EditorialScreenshotInputError";
  }
}

export const assertEditorialScreenshotBudget = (byteLengths: number[]) => {
  if (byteLengths.reduce((sum, length) => sum + length, 0) > MAX_EDITORIAL_SCREENSHOT_BYTES) {
    throw new EditorialScreenshotInputError();
  }
};

// Only literal, well-formed watch/share URLs count as textual video evidence.
// Bare IDs, lookalike hosts, redirect parameters, and model-only IDs do not.
export const selectTextEvidencedYouTubeId = (text: string | undefined, proposedId?: unknown): string | null => {
  const ids = new Set<string>();
  for (const match of text?.matchAll(/https?:\/\/[^\s<>"']+/gi) ?? []) {
    try {
      const url = new URL(match[0].replace(/[),.;!?]+$/, ""));
      if (url.username || url.password || url.port) continue;
      const host = url.hostname.toLowerCase();
      const candidate = ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host) && url.pathname === "/watch"
        ? url.searchParams.get("v")
        : ["youtu.be", "www.youtu.be"].includes(host) && /^\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname)
          ? url.pathname.split("/")[1]
          : null;
      if (candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate)) ids.add(candidate);
    } catch {
      // Malformed text is evidence to review, not a valid video URL.
    }
  }
  if (typeof proposedId === "string" && ids.has(proposedId)) return proposedId;
  return ids.size === 1 ? [...ids][0] : null;
};

export const editorialScreenshotUrls = (input: { screenshotUrl?: string; screenshotUrls?: string[] }) =>
  [...new Set([...(input.screenshotUrls ?? []), ...(input.screenshotUrl ? [input.screenshotUrl] : [])])];

export const editorialGenerateRequestSchema = z.object({
  collection: editorialCollectionSchema,
  sourceUrl: z.string().trim().url().optional(),
  sourceText: z.string().trim().min(1).max(60_000).optional(),
  screenshotUrl: evidenceScreenshotUrl.optional(),
  screenshotUrls: z.array(evidenceScreenshotUrl).max(8).optional(),
  guidance: z.string().trim().max(10_000).optional(),
  currentDraft: z.object({
    title: z.string().max(500).optional(),
    slug: z.string().max(500).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  }).strict().optional(),
}).strict().superRefine(
  (input, context) => {
    const { sourceUrl, sourceText, guidance } = input;
    const screenshots = editorialScreenshotUrls(input);
    if (screenshots.length > 8) {
      context.addIssue({
        code: "custom",
        path: ["screenshotUrls"],
        message: "Attach at most eight screenshots in total",
      });
    }
    if (!sourceUrl && !sourceText && screenshots.length === 0 && !guidance?.trim()) {
      context.addIssue({
        code: "custom",
        message: "A source URL, pasted text, screenshot, or nonblank guidance is required",
        input: undefined,
      });
    }
  },
);

export type EditorialGenerateRequest = z.infer<typeof editorialGenerateRequestSchema>;

export const editorialCoverImageRequestSchema = z.object({
  collection: editorialCollectionSchema,
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(4_000).optional(),
}).strict();
