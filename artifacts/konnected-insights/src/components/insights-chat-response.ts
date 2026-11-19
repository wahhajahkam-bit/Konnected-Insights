export type ChatSource = {
  id: string;
  title: string;
  url: string;
  date?: string | null;
  stale?: boolean;
};

type ChatData = { answer: string; sources: ChatSource[]; degraded?: boolean };
export const CHAT_UNAVAILABLE = 'The Insights Guide is temporarily unavailable. Please try again shortly.';

export class ChatResponseError extends Error {}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function source(value: unknown): value is ChatSource {
  return record(value) &&
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.title === 'string' && value.title.length > 0 &&
    typeof value.url === 'string' &&
    (value.date === undefined || value.date === null || typeof value.date === 'string') &&
    (value.stale === undefined || typeof value.stale === 'boolean');
}

export async function readChatResponse(response: Response): Promise<ChatData> {
  const unavailable = () => new ChatResponseError(CHAT_UNAVAILABLE);
  if (response.redirected || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    throw unavailable();
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw unavailable();
  }
  if (!record(payload)) throw unavailable();
  if (payload.error !== undefined) {
    const error = payload.error;
    // Only display bounded, plain-text messages from the structured API contract.
    if (record(error) && typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) &&
      typeof error.message === 'string' && error.message.trim().length > 0 &&
      error.message.length <= 300 && !/[<>]|SyntaxError|DOCTYPE|Unexpected token|JSON\.parse/i.test(error.message)) {
      throw new ChatResponseError(error.message);
    }
    throw unavailable();
  }
  const data = payload.data;
  if (!response.ok || !record(data) ||
    typeof data.answer !== 'string' || !data.answer.trim() ||
    !Array.isArray(data.sources) || !data.sources.every(source) ||
    (data.degraded !== undefined && typeof data.degraded !== 'boolean')) {
    throw unavailable();
  }
  return { answer: data.answer, sources: data.sources, degraded: data.degraded as boolean | undefined };
}