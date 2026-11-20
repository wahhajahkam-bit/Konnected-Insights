import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { isAbsolute } from "node:path";
import { PassThrough } from "node:stream";
import { encryptStream, validatePassphrase } from "./recovery-crypto.mjs";

// Never fall back to DATABASE_URL or inherited PG* connection settings.
export async function main() {
  const { values } = parseArgs({ options: {
    "source-label": { type: "string" }, output: { type: "string" },
    "approve-runtime-export": { type: "boolean" },
  } });
  if (!values["approve-runtime-export"] || !/^(development|production|synthetic)-[a-z0-9-]{1,64}$/.test(values["source-label"] || ""))
    throw new Error("Require --approve-runtime-export and --source-label development-ALIAS, production-ALIAS or synthetic-ALIAS (lowercase).");
  if (!values.output || !isAbsolute(values.output)) throw new Error("--output must be an absolute private path.");
  const passphrase = process.env.RECOVERY_BACKUP_PASSPHRASE;
  validatePassphrase(passphrase);
  const url = process.env.RECOVERY_SOURCE_DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error("Set explicit RECOVERY_SOURCE_DATABASE_URL; no default source is permitted.");
  const env = { PATH: process.env.PATH, LANG: "C", PGDATABASE: url, PGPASSFILE: "/dev/null", PGSERVICEFILE: "/dev/null", PGCONNECT_TIMEOUT: "20" };
  const child = spawn("pg_dump", ["--format=custom", "--no-password"], { env, stdio: ["ignore", "pipe", "ignore"] });
  const buffered = child.stdout.pipe(new PassThrough());
  const done = new Promise(resolve => {
    child.once("error", () => resolve(false));
    child.once("close", code => resolve(code === 0));
  });
  try {
    await encryptStream(buffered, values.output, passphrase, async () => {
      if (!await done) throw new Error("pg_dump failed; no archive published. Verify source access and tool compatibility privately.");
    });
  } catch (error) { child.kill("SIGTERM"); await done; throw error; }
  console.log(`Encrypted full-database archive completed; declared source: ${values["source-label"]}. Source label is operator supplied, not verified.`);
}
main().catch(() => {
  // Never print untrusted argument, libpq, filesystem or credential-bearing errors.
  console.error("Recovery export failed. Require explicit approval, valid source label, absolute private output, dedicated source URL and 24+ character passphrase; check permissions/tool compatibility. No success receipt issued.");
  process.exitCode = 1;
});