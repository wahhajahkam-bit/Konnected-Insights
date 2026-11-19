import { readFile } from "node:fs/promises";
import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('future-work-schema'))");
  await client.query(await readFile(new URL("../migrations/future-work.sql", import.meta.url), "utf8"));
  await client.query("COMMIT");
  console.log("Future work additive migration applied.");
} catch (error) {
  await client.query("ROLLBACK"); throw error;
} finally { await client.end(); }