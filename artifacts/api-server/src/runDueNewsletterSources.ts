import { pool } from "@workspace/db";
import { claimAndRunDueNewsletterSources } from "./lib/gmailNewsletterIngestion";
import { logger } from "./lib/logger";

try {
  const claimed = await claimAndRunDueNewsletterSources();
  logger.info({ claimed }, "One-shot due Gmail newsletter source run completed");
} catch (error) {
  logger.error({ err: error }, "One-shot due Gmail newsletter source run failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}