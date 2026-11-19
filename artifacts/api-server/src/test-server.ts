// Real API routes and database, without seed writes or background automation.
// This entrypoint is owned and cleaned up by Playwright, never by deployment.
import { assertSavedSourceTestEnvironment } from "../../../scripts/saved-source-test-guard.mjs";

assertSavedSourceTestEnvironment({
  ...process.env,
  FUTURE_WORK_PREFLIGHT_TEST_DATABASE: "development",
});

async function start() {
  // Validate the environment before importing modules that open DB connections.
  const [{ default: app }, { pool }] = await Promise.all([
    import("./app"),
    import("@workspace/db"),
  ]);
  const server = app.listen(8080, "127.0.0.1");
  server.on("error", (error) => {
    console.error("Editorial test API failed to listen:", error.message);
    process.exit(1);
  });
  const shutdown = () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

start().catch((error: unknown) => {
  console.error("Editorial test API failed to start:", error instanceof Error ? error.message : "Unknown error");
  process.exit(1);
});