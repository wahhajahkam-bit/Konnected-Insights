import { normalizeNewsletterUrl } from "./editorialNewsletter";

export type GmailMinimalMessage = {
  id: string;
  threadId: string;
  date?: string;
  sender?: string;
  subject?: string;
  snippet?: string;
};

const senderAddress = (sender: string) => {
  const angle = sender.match(/<([^<>]+)>/);
  return (angle?.[1] ?? sender).trim().toLowerCase();
};

export const matchesConfiguredMessage = (
  source: { senderEmail: string; subjectKeywords: string[] },
  message: Pick<GmailMinimalMessage, "sender" | "subject">,
) => {
  if (!message.sender || senderAddress(message.sender) !== source.senderEmail.toLowerCase()) return false;
  if (!source.subjectKeywords.length) return true;
  const subject = (message.subject ?? "").toLocaleLowerCase("en");
  return source.subjectKeywords.some((keyword) =>
    subject.includes(keyword.trim().toLocaleLowerCase("en"))
  );
};

const decodeBase64Url = (value: string) => {
  try {
    return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
};

const collectBodies = (part: unknown, output: string[]) => {
  if (!part || typeof part !== "object") return;
  const record = part as Record<string, unknown>;
  const mimeType = typeof record.mimeType === "string" ? record.mimeType : "";
  const body = record.body;
  if (
    (mimeType === "text/plain" || mimeType === "text/html")
    && body && typeof body === "object"
    && typeof (body as Record<string, unknown>).data === "string"
  ) output.push(decodeBase64Url((body as Record<string, unknown>).data as string));
  if (Array.isArray(record.parts)) record.parts.forEach((child) => collectBodies(child, output));
};

export const parseFullGmailMessage = (raw: Record<string, unknown>) => {
  const bodies: string[] = [];
  collectBodies(raw.payload, bodies);
  const rawBody = bodies.join("\n");
  const text = rawBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 30_000);
  const urls = [...rawBody.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)]
    .map((match) => match[0]!.replace(/&amp;/gi, "&").replace(/[.,;!?]+$/, ""))
    .filter((value, index, all) => all.indexOf(value) === index);
  return { text, urls };
};

export const isUnsafeNewsletterLink = (input: string) => {
  try {
    const url = new URL(input);
    return /(^|[./_-])(unsubscribe|preferences?|optout|security|privacy|tracking|login|signin|verify)([./?&=_-]|$)/i
      .test(`${url.hostname}${url.pathname}${url.search}`);
  } catch {
    return true;
  }
};

export const chooseEvidencedArticleUrl = (urls: string[], references: string[]) => {
  const candidates = urls.filter((url) => normalizeNewsletterUrl(url) && !isUnsafeNewsletterLink(url));
  const normalizedReferences = new Set(references.map(normalizeNewsletterUrl).filter(Boolean));
  return candidates.find((url) => normalizedReferences.has(normalizeNewsletterUrl(url)))
    ?? candidates.find((url) => {
      try {
        return !/(mail\.google\.com|google\.com)$/i.test(new URL(url).hostname);
      } catch {
        return false;
      }
    });
};

export const hasEvidencedReferenceMatch = (urls: string[], references: string[]) => {
  const normalized = new Set(references.map(normalizeNewsletterUrl).filter(Boolean));
  return urls.some((url) => normalized.has(normalizeNewsletterUrl(url)));
};

export const firstRunBySource = <T extends { sourceId: string }>(runsNewestFirst: T[]) => {
  const latest = new Map<string, T>();
  for (const run of runsNewestFirst) if (!latest.has(run.sourceId)) latest.set(run.sourceId, run);
  return latest;
};

export const hasRunDeadlineElapsed = (deadlineAt: number, now = Date.now()) => now >= deadlineAt;

export const requireAiExtractionEvidence = <T extends { title: string; excerpt: string; articleUrl: string }>(
  extracted: T,
  evidence: { subject: string; snippet: string; text: string; urls: string[] },
) => {
  const searchable = `${evidence.subject}\n${evidence.snippet}\n${evidence.text}`;
  if (
    (extracted.title && !searchable.includes(extracted.title))
    || (extracted.excerpt && !searchable.includes(extracted.excerpt))
    || (extracted.articleUrl && !evidence.urls.includes(extracted.articleUrl))
    || (extracted.articleUrl && isUnsafeNewsletterLink(extracted.articleUrl))
  ) throw new Error("AI output was rejected because it was not supported by email evidence");
  return extracted;
};