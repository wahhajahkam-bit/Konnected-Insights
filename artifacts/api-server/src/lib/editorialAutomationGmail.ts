import { ReplitConnectors } from "@replit/connectors-sdk";
import { automationSearchQuery, senderAddress, withAutomationTimeout } from "./editorialAutomationPolicy";

export class AutomationServiceError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const gmail = async (path: string): Promise<any> => {
  let response: Response;
  try {
    response = await withAutomationTimeout(new ReplitConnectors().proxy("google-mail", path, { method: "GET" }), 30_000);
  } catch {
    throw new AutomationServiceError("GMAIL_UNAVAILABLE", "Gmail is unavailable. Check the connected Gmail account and try again.");
  }
  if (!response.ok) {
    throw new AutomationServiceError("GMAIL_UNAVAILABLE",
      response.status === 401 || response.status === 403
        ? "Gmail access needs authorization. Reconnect the Gmail integration with read permission."
        : "Gmail could not be read. Please retry later.");
  }
  return withAutomationTimeout(response.json(), 30_000);
};

export async function automationMailbox() {
  const profile = await gmail("/gmail/v1/users/me/profile");
  if (typeof profile.emailAddress !== "string" || !profile.emailAddress.includes("@")) {
    throw new AutomationServiceError("GMAIL_UNAVAILABLE", "Gmail did not return a valid mailbox profile.");
  }
  return profile.emailAddress.toLowerCase() as string;
}

export type AutomationCandidate = { id: string; sender: string; subject: string; date: string };
export async function searchAutomationMessages(
  rule: { senders: string[]; search: string; lookbackDays: number; maxItems: number },
): Promise<{ messages: AutomationCandidate[]; hasMore: boolean }> {
  const query = automationSearchQuery(rule);
  const found = await gmail(`/gmail/v1/users/me/threads:search?q=${encodeURIComponent(query)}&pageSize=20&view=THREAD_VIEW_MINIMAL`);
  if (!Array.isArray(found.threads)) throw new AutomationServiceError("GMAIL_RESPONSE_INVALID", "Gmail search returned an unexpected response.");
  const messages: AutomationCandidate[] = [];
  const cutoff = Date.now() - rule.lookbackDays * 86_400_000;
  for (const thread of found.threads) {
    if (thread.error) throw new AutomationServiceError("GMAIL_SEARCH_PARTIAL", "Gmail could not read every matching thread. Retry this run.");
    for (const message of thread.messages ?? []) {
      const date = Date.parse(message.date);
      const sender = typeof message.sender === "string" ? senderAddress(message.sender) : "";
      if (!rule.senders.includes(sender) || !Number.isFinite(date) || date < cutoff) continue;
      if (typeof message.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(message.id)) continue;
      if (messages.some(candidate => candidate.id === message.id)) continue;
      messages.push({ id: message.id, sender, subject: String(message.subject ?? "").slice(0, 500), date: message.date });
    }
  }
  return {
    messages: messages.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 100),
    hasMore: Boolean(found.nextPageToken) || found.threads.some((thread: any) => thread.messagesTruncated) || messages.length > 100,
  };
}

type MimePart = { mimeType?: string; body?: { data?: string; size?: number }; parts?: MimePart[] };
export function extractAutomationBody(part: MimePart, depth = 0): string {
  if (depth > 12) return "";
  const children = (part.parts ?? []).map(child => extractAutomationBody(child, depth + 1)).filter(Boolean);
  if (children.length) return children.join("\n").slice(0, 60_000);
  if (!["text/plain", "text/html"].includes(part.mimeType ?? "") || !part.body?.data) return "";
  if (part.body.data.length > 2_000_000) throw new AutomationServiceError("MESSAGE_TOO_LARGE", "A matching message was too large for safe extraction.");
  const decoded = Buffer.from(part.body.data, "base64url").toString("utf8");
  return (part.mimeType === "text/html"
    ? decoded.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi, " $1 ")
      .replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    : decoded).slice(0, 60_000);
}

export async function readAutomationMessage(candidate: AutomationCandidate) {
  const message = await gmail(`/gmail/v1/users/me/messages/${encodeURIComponent(candidate.id)}?format=full`);
  const headers = Array.isArray(message.payload?.headers) ? message.payload.headers : [];
  const from = headers.find((header: any) => String(header.name).toLowerCase() === "from")?.value;
  if (typeof from !== "string" || senderAddress(from) !== candidate.sender) {
    throw new AutomationServiceError("MESSAGE_SENDER_CHANGED", "A matching message did not have the configured sender.");
  }
  const body = extractAutomationBody(message.payload ?? {});
  if (!body.trim()) throw new AutomationServiceError("MESSAGE_EMPTY", "A matching message had no readable body.");
  // Recipients and private Gmail URLs are deliberately not passed to the model.
  return `Subject: ${candidate.subject}\n\n${body}`.slice(0, 60_000);
}