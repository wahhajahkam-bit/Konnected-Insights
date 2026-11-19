import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('editorial:automation-schema'))");
  await client.query(await readFile(new URL("../migrations/editorial-automation.sql", import.meta.url), "utf8"));
  await client.query("COMMIT");
  process.stdout.write("Editorial automation tables are ready.\n");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}