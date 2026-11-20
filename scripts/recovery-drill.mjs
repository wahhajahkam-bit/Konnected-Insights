// Synthetic-only independent cluster. Never inherits any application credentials.
import { spawnSync, spawn } from "node:child_process";
import { mkdtemp, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PassThrough } from "node:stream";
import { encryptStream, decryptFile, verifyEncryptedFile } from "./recovery-crypto.mjs";

const root = await mkdtemp(join(tmpdir(), "recovery-drill-"));
await chmod(root, 0o700);
const data = join(root, "cluster");
const env = { PATH: process.env.PATH, LANG: "C", HOME: root, PGHOST: root, PGPORT: "5432", PGUSER: "recovery_drill", PGPASSFILE: "/dev/null", PGSERVICEFILE: "/dev/null" };
function run(command, args, input) {
  const result = spawnSync(command, args, { env, input, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Synthetic drill command failed: ${command}: ${result.stderr || "tool unavailable"}`);
  return result.stdout.trim();
}
let started = false;
try {
  run("initdb", ["-D", data, "-U", "recovery_drill", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  // No TCP listener. Unix socket only in our mode-0700 directory.
  run("pg_ctl", ["-D", data, "-l", join(root, "postgres.log"), "-o", `-c listen_addresses='' -c unix_socket_directories='${root}' -c unix_socket_permissions=0700`, "-w", "start"]);
  started = true;
  run("createdb", ["source_fixture"]);
  run("createdb", ["restored_fixture"]);
  const psql = (db, sql) => run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-d", db], sql);
  // Representative schema, intentionally not a production migration or full schema clone.
  psql("source_fixture", `
CREATE TYPE editorial_status AS ENUM ('draft','published');
CREATE TABLE editorial_items (
 id uuid PRIMARY KEY, collection text NOT NULL, slug text NOT NULL UNIQUE,
 title text NOT NULL, source_id text UNIQUE, status editorial_status NOT NULL,
 data jsonb NOT NULL, version integer NOT NULL DEFAULT 1);
CREATE TABLE editorial_image_assets (
 id uuid PRIMARY KEY, purpose varchar(16) NOT NULL, content_type varchar(32) NOT NULL,
 original_name varchar(255) NOT NULL, size integer NOT NULL, bytes bytea NOT NULL,
 uploaded_by_user_id text NOT NULL);
CREATE TYPE editorial_staff_role AS ENUM ('owner','admin','editor');
CREATE TABLE editorial_staff (id uuid PRIMARY KEY, email text UNIQUE NOT NULL,
 role editorial_staff_role NOT NULL, clerk_user_id text, clerk_invitation_id text,
 invitation_claim_token uuid, created_by_user_id text NOT NULL);
CREATE TABLE future_work_functions (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE future_work_research_queue (id uuid PRIMARY KEY,
 function_id uuid NOT NULL REFERENCES future_work_functions(id), status text NOT NULL,
 attempts integer NOT NULL DEFAULT 0);
CREATE TABLE synthetic_sequence_check (id serial PRIMARY KEY);
INSERT INTO synthetic_sequence_check DEFAULT VALUES;
INSERT INTO editorial_image_assets VALUES
 ('00000000-0000-4000-8000-000000000001','public','image/png','synthetic.bin',4,decode('0001feff','hex'),'synthetic-user'),
 ('00000000-0000-4000-8000-000000000002','evidence','image/png','empty.bin',0,''::bytea,'synthetic-user'),
 ('00000000-0000-4000-8000-000000000003','generated','image/png','large.bin',1048576,decode(repeat('ab',1048576),'hex'),'synthetic-user');
INSERT INTO editorial_items VALUES
 ('10000000-0000-4000-8000-000000000001','newsletters','synthetic-draft','Synthetic draft','synthetic-source', 'draft',
 '{"body":{"paragraphs":["Synthetic — text",null,""]},"media":["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002","00000000-0000-4000-8000-000000000003"]}',7),
 ('10000000-0000-4000-8000-000000000002','masterclasses','synthetic-published','Synthetic published',null,'published','{}',1);
INSERT INTO editorial_staff VALUES
 ('20000000-0000-4000-8000-000000000001','owner@example.invalid','owner','synthetic-clerk-user',null,null,'synthetic-user'),
 ('20000000-0000-4000-8000-000000000002','editor@example.invalid','editor',null,'synthetic-invitation','20000000-0000-4000-8000-000000000003','synthetic-user');
INSERT INTO future_work_functions VALUES ('30000000-0000-4000-8000-000000000001','Synthetic function');
INSERT INTO future_work_research_queue
 SELECT ('40000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
 '30000000-0000-4000-8000-000000000001',state,i-1
 FROM unnest(ARRAY['queued','running','completed','failed']) WITH ORDINALITY AS t(state,i);
`);
  const summary = `
SELECT jsonb_build_object(
 'articles',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM editorial_items t),
 'staff',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM editorial_staff t),
 'functions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM future_work_functions t),
 'queues',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM future_work_research_queue t),
 'media',(SELECT jsonb_agg(jsonb_build_object('id',id,'purpose',purpose,'mime',content_type,'size',size,'actual',octet_length(bytes),'sha256',encode(sha256(bytes),'hex')) ORDER BY id) FROM editorial_image_assets),
 'resolved',(SELECT count(*) FROM editorial_items i CROSS JOIN LATERAL jsonb_array_elements_text(i.data->'media') ref JOIN editorial_image_assets a ON a.id=ref::uuid)
);`;
  const expected = psql("source_fixture", summary);
  const pass = randomBytes(32).toString("base64");
  const encrypted = join(root, "synthetic.enc"), plain = join(root, "authenticated.dump");
  const dump = spawn("pg_dump", ["-Fc", "--no-password", "-d", "source_fixture"], { env, stdio: ["ignore", "pipe", "ignore"] });
  const buffered = dump.stdout.pipe(new PassThrough());
  const done = new Promise(resolve => { dump.on("error", () => resolve(false)); dump.on("close", c => resolve(c === 0)); });
  await encryptStream(buffered, encrypted, pass, async () => { assert.equal(await done, true); });
  await verifyEncryptedFile(encrypted, pass);
  await decryptFile(encrypted, plain, pass);
  run("pg_restore", ["--exit-on-error", "--no-owner", "--no-privileges", "-d", "restored_fixture", plain]);
  assert.equal(psql("restored_fixture", summary), expected);
  assert.equal(JSON.parse(expected).resolved, 3);
  assert.equal(psql("restored_fixture", "SELECT nextval('synthetic_sequence_check_id_seq');"), "2");
  assert.throws(() => psql("restored_fixture", "INSERT INTO future_work_research_queue VALUES ('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','queued',0);"));
  console.log("PASS synthetic isolated dump/encrypt/authenticate/decrypt/restore: JSON, UUIDs, 3 media purposes and hashes (empty/1MiB), staff placeholders, FK, sequence, queue states. No app or workers started.");
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  await rm(root, { recursive: true, force: true });
  console.log("Synthetic cluster and all staging removed.");
}