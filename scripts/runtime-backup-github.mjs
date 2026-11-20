#!/usr/bin/env node
// Only authenticated ciphertext is eligible for this separate GitHub branch.
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdtemp, open, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { verifyEncryptedFile, validatePassphrase } from "./recovery-crypto.mjs";
import { repository } from "./source-backup-policy.mjs";

export const encryptedBranch = "encrypted-backups";
const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_SIZE = 512 * 1024 * 1024;
const marker = "# Encrypted recovery backups\n\nCiphertext only. Keep the passphrase outside GitHub.\nSee docs/backup-decryption.md on the source-backup branch for recovery instructions.\n";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const gitHash = bytes => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

export function validateManifest(value) {
  if (value?.format !== "konnected-encrypted-chunks-v1" ||
      !["development", "production"].includes(value.environment) ||
      !/^[a-f0-9]{64}$/.test(value.sha256) ||
      !Number.isSafeInteger(value.bytes) || value.bytes < 68 || value.bytes > MAX_SIZE ||
      !Array.isArray(value.chunks) || !value.chunks.length ||
      value.chunks.length !== Math.ceil(value.bytes / CHUNK_SIZE)) {
    throw new Error("Invalid encrypted backup manifest.");
  }
  let total = 0;
  value.chunks.forEach((chunk, i) => {
    const expected = Math.min(CHUNK_SIZE, value.bytes - i * CHUNK_SIZE);
    if (chunk.name !== `chunk-${String(i).padStart(5, "0")}.bin` ||
        chunk.bytes !== expected || !/^[a-f0-9]{64}$/.test(chunk.sha256)) {
      throw new Error("Invalid encrypted backup chunk.");
    }
    total += chunk.bytes;
  });
  if (total !== value.bytes) throw new Error("Encrypted backup size mismatch.");
  return value;
}

export async function uploadEncryptedBackup({ input, environment, passphrase, request }) {
  validatePassphrase(passphrase);
  if (!["development", "production"].includes(environment)) throw new Error("Explicit source environment required.");
  const source = await stat(input);
  if (!source.isFile() || source.size < 68 || source.size > MAX_SIZE) {
    throw new Error("Expected encrypted regular file, at most 512 MiB; larger backups need an approved storage approach.");
  }
  const staging = await mkdtemp(join(tmpdir(), "konnected-ciphertext-"));
  try {
    const staged = join(staging, "archive.enc");
    await copyFile(input, staged, constants.COPYFILE_EXCL);
    // This rejects a plain dump, wrong passphrase and modified/truncated archive.
    await verifyEncryptedFile(staged, passphrase);
    const repo = await request("");
    if (!repo.private || repo.permissions?.push !== true) throw new Error("Private repository with write access required.");
    const ref = `/git/ref/heads/${encryptedBranch}`;
    const old = await request(ref, "GET", undefined, true);
    const parent = old?.object?.sha;
    let baseTree;
    if (parent) {
      const commit = await request(`/git/commits/${parent}`);
      const tree = await request(`/git/trees/${commit.tree.sha}?recursive=1`);
      if (tree.truncated || tree.tree.some(x => x.type === "blob" &&
          (x.mode !== "100644" || (x.path !== "README.md" &&
          !/^snapshots\/[a-zA-Z0-9-]+\/(?:manifest\.json|chunk-\d{5}\.bin)$/.test(x.path))))) {
        throw new Error("Unexpected encrypted backup branch content; refusing to extend it.");
      }
      const readme = tree.tree.find(x => x.path === "README.md" && x.type === "blob");
      if (!readme || readme.sha !== gitHash(Buffer.from(marker))) throw new Error("Unrecognized backup branch.");
      baseTree = commit.tree.sha;
    }
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
    const directory = `snapshots/${id}`;
    const treeEntries = parent ? [] : [{ path: "README.md", mode: "100644", type: "blob", content: marker }];
    const chunks = [];
    const digest = createHash("sha256");
    const fd = await open(staged, "r");
    let bytes = 0;
    try {
      const size = (await fd.stat()).size;
      if (size > MAX_SIZE) throw new Error("Ciphertext size changed.");
      for (let offset = 0, index = 0; offset < size; index++) {
        const buffer = Buffer.alloc(Math.min(CHUNK_SIZE, size - offset));
        let filled = 0;
        while (filled < buffer.length) {
          const result = await fd.read(buffer, filled, buffer.length - filled, offset + filled);
          if (!result.bytesRead) throw new Error("Unexpected end of ciphertext.");
          filled += result.bytesRead;
        }
        const name = `chunk-${String(index).padStart(5, "0")}.bin`;
        const blob = await request("/git/blobs", "POST", { content: buffer.toString("base64"), encoding: "base64" });
        if (blob.sha !== gitHash(buffer)) throw new Error("Uploaded chunk hash mismatch.");
        const remote = await request(`/git/blobs/${blob.sha}`);
        if (remote.encoding !== "base64" || hash(Buffer.from(remote.content, "base64")) !== hash(buffer)) {
          throw new Error("Downloaded chunk verification failed.");
        }
        treeEntries.push({ path: `${directory}/${name}`, mode: "100644", type: "blob", sha: blob.sha });
        chunks.push({ name, bytes: buffer.length, sha256: hash(buffer) });
        digest.update(buffer); offset += buffer.length; bytes += buffer.length;
      }
    } finally { await fd.close(); }
    const manifest = validateManifest({ format: "konnected-encrypted-chunks-v1",
      createdAt: new Date().toISOString(), environment, bytes, sha256: digest.digest("hex"), chunks });
    const manifestText = JSON.stringify(manifest, null, 2) + "\n";
    treeEntries.push({ path: `${directory}/manifest.json`, mode: "100644", type: "blob", content: manifestText });
    const tree = await request("/git/trees", "POST", { ...(baseTree ? { base_tree: baseTree } : {}), tree: treeEntries });
    const commit = await request("/git/commits", "POST", {
      message: `Encrypted ${environment} recovery snapshot ${id}`, tree: tree.sha, parents: parent ? [parent] : [],
    });
    const latest = await request(ref, "GET", undefined, true);
    if ((latest?.object?.sha ?? null) !== (parent ?? null)) throw new Error("Backup branch changed; no branch update attempted.");
    if (parent) await request(`/git/refs/heads/${encryptedBranch}`, "PATCH", { sha: commit.sha, force: false });
    else await request("/git/refs", "POST", { ref: `refs/heads/${encryptedBranch}`, sha: commit.sha });
    const verified = await request(ref);
    const finalTree = await request(`/git/trees/${commit.sha}?recursive=1`);
    if (verified.object.sha !== commit.sha || finalTree.truncated ||
        treeEntries.some(entry => !finalTree.tree.some(actual =>
          actual.path === entry.path && actual.mode === entry.mode &&
          actual.sha === (entry.sha ?? gitHash(Buffer.from(entry.content)))))) {
      throw new Error("Branch written but final verification failed; inspect remote before retry.");
    }
    return { repository, branch: encryptedBranch, commit: commit.sha, directory,
      environment, bytes, sha256: manifest.sha256,
      url: `https://github.com/${repository}/tree/${commit.sha}/${directory}` };
  } finally { await rm(staging, { recursive: true, force: true }); }
}

async function main() {
  const [flag, input, environment] = process.argv.slice(2);
  if (flag !== "--approve-upload" || !input || !environment || process.argv.length !== 5) {
    throw new Error("Usage: node scripts/runtime-backup-github.mjs --approve-upload <encrypted-file> <development|production>");
  }
  const connectors = new ReplitConnectors();
  const request = async (path, method = "GET", body, allow404 = false) => {
    const response = await connectors.proxy("github", `/repos/${repository}${path}`, {
      method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub request failed (${response.status}); no automatic retry or force update.`);
    return response.json();
  };
  console.log(JSON.stringify(await uploadEncryptedBackup({
    input: resolve(input), environment, passphrase: process.env.RECOVERY_BACKUP_PASSPHRASE, request,
  }), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error("Encrypted upload failed. Check key, file, private repository access and remote branch; never retry blindly after a network failure."); process.exitCode = 1; });
}