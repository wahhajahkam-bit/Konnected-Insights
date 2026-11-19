import { test } from "@playwright/test";

import { cleanupNewsletterRun } from "./helpers/newsletter-live-fixture";

test("replays cleanup for an interrupted newsletter live run", async () => {
  test.setTimeout(120_000);
  const runId = process.env.NEWSLETTER_CLEANUP_RUN_ID;
  if (!runId) {
    throw new Error("NEWSLETTER_CLEANUP_RUN_ID is required");
  }
  await cleanupNewsletterRun(runId);
});