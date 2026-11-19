import type { EditorialSource } from "./editorialSource";

type EventPostProcessingInput = {
  data: Record<string, unknown>;
  source?: EditorialSource;
  warnings: string[];
};

export const isUsableEventSourceImage = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (/(^|\.)static\.licdn\.com$/i.test(url.hostname)) {
      return false;
    }
    if (
      /(^|\.)linkedin\.com$/i.test(url.hostname)
      && /(favicon|logo|linkedin-bug|li-logo|login)/i.test(url.pathname)
    ) {
      return false;
    }
    return true;
  } catch {
    return value.startsWith("/") && !value.startsWith("//");
  }
};

/**
 * Applies server-owned facts after generation. A page canonical is metadata,
 * not proof that it is the URL that passed the SSRF validation.
 */
export const postProcessEventDraft = ({
  data,
  source,
  warnings,
}: EventPostProcessingInput): void => {
  if (source?.url) data.sourceUrl = source.url;

  const existing = Array.isArray(data.images)
    ? data.images.filter(isUsableEventSourceImage)
    : [];
  if (isUsableEventSourceImage(source?.image)) {
    data.images = [...new Set([source.image, ...existing])];
  } else {
    data.images = [...new Set(existing)];
  }

  if (typeof data.startAt !== "string" || !data.startAt.trim()) {
    warnings.push("Event start date and time are unknown and will be shown as unconfirmed. Add them only when verified.");
  }
  if (typeof data.location !== "string" || !data.location.trim()) {
    warnings.push("Event location is unknown. Leave it empty unless the venue or online attendance details are verified.");
  }
  if (!Array.isArray(data.images) || data.images.length === 0) {
    data.images = [];
    warnings.push("Event image is optional; leave it empty for the no-image layout, upload organizer artwork, or explicitly generate representative artwork.");
  }
  if (typeof data.timezone !== "string" || !data.timezone.trim()) {
    warnings.push("Event timezone is unknown. Do not infer a timezone from the site location; add the organizer's timezone only when verified.");
  }
  if (!source?.url) {
    warnings.push("No public source URL was supplied. This optional link can stay empty.");
  }
};