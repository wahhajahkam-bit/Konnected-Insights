import app from "./app";
import { logger } from "./lib/logger";
import { seedEditorialItems } from "./routes/editorial-seed";
import { startLinkedInNewsletterScheduler } from "./lib/linkedinNewsletterIngestion";
import { startEditorialAutomationScheduler } from "./lib/editorialAutomation";
import { startGmailNewsletterScheduler } from "./lib/gmailNewsletterIngestion";
import { startFutureWorkScheduler } from "./lib/futureWorkResearch";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  await seedEditorialItems();
  startLinkedInNewsletterScheduler();
  startGmailNewsletterScheduler();
  const stopAutomation = startEditorialAutomationScheduler();
  const stopFutureWork = startFutureWorkScheduler(error => logger.error({ err: error }, "Future work scheduler failed"));

  const server = app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
  const shutdown = () => {
    stopAutomation();
    stopFutureWork();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

start().catch((error: unknown) => {
  logger.fatal({ err: error }, "Failed to initialize API server");
  process.exit(1);
});
