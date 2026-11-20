import OpenAI from "openai";

let client: OpenAI | undefined;
function getClient() {
  if (client) return client;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) throw new Error("AI is not configured for this environment.");
  return client = new OpenAI({ apiKey, baseURL });
}

// Browsing a preview must not require credentials for optional AI features.
export const openai = {
  get chat() { return getClient().chat; },
  get responses() { return getClient().responses; },
  get images() { return getClient().images; },
};
