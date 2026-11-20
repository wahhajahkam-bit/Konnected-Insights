import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { encryptStream } from "./recovery-crypto.mjs";
import { uploadEncryptedBackup, validateManifest } from "./runtime-backup-github.mjs";
import { reassemble } from "./reassemble-backup.mjs";

const passphrase = "synthetic-only-backup-passphrase-for-unit-tests";
const blobHash = bytes => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
test("plaintext or invalid key never reaches GitHub", async () => {
  const dir = await mkdtemp(join(tmpdir(), "backup-upload-test-"));
  try {
    const input = join(dir, "plain");
    await writeFile(input, "plain sensitive-looking fixture ".repeat(10));
    let calls = 0;
    await assert.rejects(uploadEncryptedBackup({ input, environment: "development", passphrase,
      request: async () => { calls++; } }));
    assert.equal(calls, 0);
    await assert.rejects(uploadEncryptedBackup({ input, environment: "development", passphrase: "",
      request: async () => { calls++; } }));
    assert.equal(calls, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("ciphertext upload verifies chunks, uses orphan branch, and reconstructs exactly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "backup-upload-test-"));
  try {
    const input = join(dir, "backup.enc");
    await encryptStream(Readable.from([Buffer.from("synthetic fixture")]), input, passphrase);
    const blobs = new Map();
    let tree = [];
    let ref = null;
    const writes = [];
    const request = async (path, method = "GET", body) => {
      if (method !== "GET") writes.push({ path, body });
      if (path === "") return { private: true, permissions: { push: true } };
      if (path === "/git/ref/heads/encrypted-backups") return ref;
      if (path === "/git/blobs" && method === "POST") {
        const buffer = Buffer.from(body.content, "base64"); const sha = blobHash(buffer);
        blobs.set(sha, buffer); return { sha };
      }
      if (path.startsWith("/git/blobs/")) return { encoding: "base64", content: blobs.get(path.split("/").at(-1)).toString("base64") };
      if (path === "/git/trees") {
        tree = body.tree.map(x => {
          if (!x.content) return x;
          const buffer = Buffer.from(x.content); const sha = blobHash(buffer); blobs.set(sha, buffer);
          return { path: x.path, mode: x.mode, type: x.type, sha };
        });
        return { sha: "tree-id" };
      }
      if (path === "/git/commits") { assert.deepEqual(body.parents, []); return { sha: "commit-id" }; }
      if (path === "/git/refs") { ref = { object: { sha: body.sha } }; return ref; }
      if (path === "/git/trees/commit-id?recursive=1") return { tree, truncated: false };
      throw new Error(`Unexpected mock request ${path}`);
    };
    const receipt = await uploadEncryptedBackup({ input, environment: "development", passphrase, request });
    assert.equal(receipt.branch, "encrypted-backups");
    assert(writes.every(x => !x.path.includes("/heads/main") && !x.path.includes("/heads/source-backup")));
    assert.equal(writes.find(x => x.path === "/git/refs").body.ref, "refs/heads/encrypted-backups");
    for (const entry of tree.filter(x => x.path.startsWith(`${receipt.directory}/`))) {
      await writeFile(join(dir, entry.path.split("/").at(-1)), blobs.get(entry.sha));
    }
    const output = join(dir, "reassembled.enc");
    await reassemble(dir, output);
    assert.deepEqual(await readFile(output), await readFile(input));
    await assert.rejects(reassemble(dir, output));
    await writeFile(join(dir, "chunk-00000.bin"), "corrupt");
    const badOutput = join(dir, "bad.enc");
    await assert.rejects(reassemble(dir, badOutput));
    await assert.rejects(access(badOutput));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("public repository fails before any uploads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "backup-upload-test-"));
  try {
    const input = join(dir, "backup.enc");
    await encryptStream(Readable.from(["synthetic fixture"]), input, passphrase);
    await assert.rejects(uploadEncryptedBackup({ input, environment: "production", passphrase,
      request: async (path, method = "GET") => {
        assert.equal(path, ""); assert.equal(method, "GET");
        return { private: false, permissions: { push: true } };
      } }), /Private repository/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("manifest rejects traversal and unsupported sizes", () => {
  const manifest = { format: "konnected-encrypted-chunks-v1", environment: "production",
    bytes: 68, sha256: "a".repeat(64), chunks: [{ name: "../secret", bytes: 68, sha256: "b".repeat(64) }] };
  assert.throws(() => validateManifest(manifest));
  manifest.chunks[0].name = "chunk-00000.bin";
  assert.equal(validateManifest(manifest), manifest);
  manifest.bytes = 1024 ** 4;
  assert.throws(() => validateManifest(manifest));
});