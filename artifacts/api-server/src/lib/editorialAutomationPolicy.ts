import { z } from "zod/v4";

const collections = ["newsletters", "masterclasses", "future-work", "events", "talks", "contributors", "communities"] as const;
const automationRuleFields = z.object({
  name: z.string().trim().min(1).max(120),
  collection: z.enum(collections),
  senders: z.array(z.string().trim().toLowerCase().email().max(320)).min(1).max(20)
    .transform(values => [...new Set(values)]),
  search: z.string().trim().max(500),
  guidance: z.string().trim().max(4000),
  enabled: z.boolean(),
  publishMode: z.enum(["draft", "automatic"]),
  scheduleUtc: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  lookbackDays: z.number().int().min(1).max(30),
  maxItems: z.number().int().min(1).max(20),
  confirmAutomaticPublishing: z.boolean().optional(),
}).strict();
export const automationRuleInput = automationRuleFields.extend({
  search: automationRuleFields.shape.search.default(""),
  guidance: automationRuleFields.shape.guidance.default(""),
  enabled: automationRuleFields.shape.enabled.default(false),
  publishMode: automationRuleFields.shape.publishMode.default("draft"),
  scheduleUtc: automationRuleFields.shape.scheduleUtc.default("02:00"),
  lookbackDays: automationRuleFields.shape.lookbackDays.default(7),
  maxItems: automationRuleFields.shape.maxItems.default(10),
});
export const automationRulePatch = automationRuleFields.partial();

export const nextAutomationRun = (scheduleUtc: string, now = new Date()) => {
  const [hours, minutes] = scheduleUtc.split(":").map(Number);
  const next = new Date(now);
  next.setUTCHours(hours, minutes, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
};

export const senderAddress = (sender: string) => {
  const address = sender.match(/<([^<>]+)>/)?.[1] ?? sender;
  return address.trim().toLowerCase();
};

export const automationSearchQuery = (rule: { senders: string[]; search: string; lookbackDays: number }) =>
  `(${rule.senders.map(sender => `from:${sender}`).join(" OR ")}) newer_than:${rule.lookbackDays}d -in:trash -in:spam${rule.search ? ` (${rule.search})` : ""}`;

const editorialKeys = new Set([
  "category", "excerpt", "url", "author", "name", "detailTitle", "framing", "implications", "authorName",
  "desc", "sections", "title", "text", "status", "startAt", "endAt", "timezone", "location", "format",
  "sourceUrl", "registrationUrl", "completionMode", "topic", "id", "role", "group", "linkedinUrl",
  "isNamedProspect", "isPlaceholder", "contributions", "articles", "description",
]);
export const sanitizeAutomationText = (value: string) => value
  .replace(/\S+/g, token => {
    let decoded = token;
    for (let i = 0; i < 4; i++) {
      const next = decoded.replace(/%([0-9a-f]{2})/gi, (_match, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)));
      if (next === decoded) break;
      decoded = next;
    }
    // Even opaque first-party links can identify an email subscriber. Without
    // independent verification, no email URL is safe to publish automatically.
    return /(?:https?:)?\/\/|www\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(decoded) ? "" : token;
  })
  .replace(/\/api\/storage\/evidence\/[^\s<>"']*/gi, "")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "");

export function sanitizeAutomationData(data: Record<string, unknown>): Record<string, unknown> {
  // Email bodies may have private tracking links and embedded attachment URLs.
  // Do not reuse any supplied picture as a public asset without editorial review.
  const sanitize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sanitize);
    if (typeof value === "string") return sanitizeAutomationText(value);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
      if (!editorialKeys.has(key)) return [];
      if (/url$/i.test(key)) return [];
      return [[key, sanitize(child)]];
    }));
  };
  return sanitize(data) as Record<string, unknown>;
}

export async function withAutomationTimeout<T>(promise: Promise<T>, timeoutMs = 60_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Automation operation timed out")), timeoutMs);
        timer.unref();
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}