import { readFile } from "node:fs/promises";
import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('agent-monitoring-schema'))");
  await client.query(await readFile(new URL("../migrations/agent-monitoring.sql", import.meta.url), "utf8"));
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally { await client.end(); }