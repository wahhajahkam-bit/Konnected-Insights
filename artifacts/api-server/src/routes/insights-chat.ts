import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { chatInput, groundedChat, selectionInstructions } from "../lib/insightsChat";
import { acquireChatBudget, ChatLimitError, loadPublicKnowledge } from "../lib/insightsChatStore";
import { anonymousChatClientIdentity, ChatIdentityConfigurationError } from "../lib/insightsChatClient";

const router = Router();
router.post("/insights-chat", async (req, res) => {
  const input = chatInput.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: { code: "INVALID_REQUEST", message: "Provide a question of 1–1000 characters and at most 6 history entries, each 1–1000 characters." } });
    return;
  }
  let release: (() => Promise<void>) | undefined;
  try {
    res.setHeader("Cache-Control", "no-store");
    release = await acquireChatBudget(anonymousChatClientIdentity(req, res));
    const data = await groundedChat(input.data, loadPublicKnowledge, async (question, sources, signal) => {
      const response = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        max_completion_tokens: 1400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: selectionInstructions },
          { role: "user", content: JSON.stringify({ question, sources: sources.map(({ url: _url, ...source }) => source) }) },
        ],
      }, { signal, timeout: 11_000, maxRetries: 0 });
      return response.choices[0]?.message.content ?? "";
    });
    res.json({ data });
  } catch (error) {
    if (error instanceof ChatIdentityConfigurationError) {
      res.status(503).json({ error: { code: "CHAT_CONFIGURATION_ERROR", message: "Chat is temporarily unavailable. Please try again later." } });
    } else if (error instanceof ChatLimitError) {
      res.setHeader("Retry-After", "60");
      res.status(error.status).json({ error: { code: error.code, message: "Chat is receiving too many requests. Please try again later." } });
    } else {
      res.status(503).json({ error: { code: "KNOWLEDGE_UNAVAILABLE", message: "Published content is temporarily unavailable. Please try again shortly." } });
    }
  } finally { await release?.(); }
});
export default router;