#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { repository, backupBranch, collectSnapshot, gitText } from "./source-backup-policy.mjs";
import { setupBackupRemote } from "./source-backup-setup.mjs";

process.chdir(resolve(fileURLToPath(new URL("..", import.meta.url))));
const apiBase = `/repos/${repository}`;
const outputDir = ".local/source-backup";
const mode = process.argv[2];
if (!["--prepare", "--publish"].includes(mode) || (mode === "--publish" && !process.argv[3])) {
  console.error("Usage: node scripts/source-backup.mjs --prepare | --publish <reviewed-digest>");
  process.exit(1);
}

async function main() {
  const snapshot = collectSnapshot();
  const { entries, ...summary } = snapshot;
  mkdirSync(outputDir, { recursive: true });
  const manifest = { ...summary, repository, branch: backupBranch,
    files: entries.map(({path, mode, sha, bytes}) => ({path, mode, sha, size: bytes.length})) };
  writeFileSync(`${outputDir}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ sourceCommit: snapshot.sourceCommit, digest: snapshot.digest,
    files: entries.length, excluded: snapshot.excluded.length, manifest: `${outputDir}/manifest.json` }, null, 2));
  if (mode === "--prepare") return;
  if (process.argv[3] !== snapshot.digest) throw new Error("Reviewed digest no longer matches main. Prepare and review again.");

  const connectors = new ReplitConnectors();
  async function request(path, method = "GET", body, allow404 = false) {
    const response = await connectors.proxy("github", `${apiBase}${path}`, {
      method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub ${method} ${path} failed (${response.status}). No automatic retry or force update. Check access and branch state.`);
    return response.json();
  }
  const repo = await request("");
  if (repo.private !== true || repo.permissions?.push !== true) throw new Error("Expected private repository with write permission. Refusing upload.");
  setupBackupRemote();

  const refPath = `/git/ref/heads/${backupBranch}`;
  const originalMain = await request("/git/ref/heads/main");
  const current = await request(refPath, "GET", undefined, true);
  let previous = "";
  try { previous = gitText("config", "--get", "sourceBackup.lastCommit"); } catch { /* first backup */ }
  if ((current?.object.sha ?? "") !== previous) throw new Error("Backup branch differs from this workspace's last verified backup. Inspect before proceeding; nothing overwritten.");
  const currentCommit = current ? await request(`/git/commits/${previous}`) : null;
  const oldTree = currentCommit ? await request(`/git/trees/${currentCommit.tree.sha}?recursive=1`) : null;
  if (oldTree?.truncated) throw new Error("GitHub tree is truncated; refusing incomplete comparison.");
  const existingBlobs = new Set((oldTree?.tree ?? []).filter((x) => x.type === "blob").map((x) => x.sha));
  // Inline UTF-8 text in the tree request to avoid hundreds of write requests.
  // Binary assets use blob endpoints; nothing is visible as a branch until complete.
  const treeEntries = [];
  let uploaded = 0;
  for (const entry of entries) {
    const item = { path: entry.path, mode: entry.mode, type: "blob" };
    if (existingBlobs.has(entry.sha)) { treeEntries.push({ ...item, sha: entry.sha }); continue; }
    const text = entry.bytes.toString("utf8");
    if (!entry.bytes.includes(0) && Buffer.from(text).equals(entry.bytes)) {
      treeEntries.push({ ...item, content: text });
      continue;
    }
    const blob = await request("/git/blobs", "POST", { content: entry.bytes.toString("base64"), encoding: "base64" });
    if (blob.sha !== entry.sha) throw new Error(`Uploaded blob mismatch: ${entry.path}`);
    existingBlobs.add(blob.sha);
    treeEntries.push({ ...item, sha: blob.sha });
    uploaded++;
    if (uploaded % 50 === 0) console.log(`Uploaded ${uploaded} missing blobs.`);
  }
  // No base_tree: explicitly replace the snapshot so removed files stay removed.
  const tree = await request("/git/trees", "POST", { tree: treeEntries });
  const stagedTree = await request(`/git/trees/${tree.sha}?recursive=1`);
  const stagedFiles = new Map(stagedTree.tree.filter((x) => x.type === "blob").map((x) => [x.path, x]));
  if (stagedTree.truncated || stagedFiles.size !== entries.length ||
      entries.some((x) => stagedFiles.get(x.path)?.sha !== x.sha || stagedFiles.get(x.path)?.mode !== x.mode)) {
    throw new Error("Staged GitHub tree does not match the reviewed snapshot; no branch updated.");
  }
  if (currentCommit?.tree.sha === tree.sha) { console.log(`Already backed up at ${previous}`); return; }
  const commit = await request("/git/commits", "POST", {
    message: `Source-only backup of main ${snapshot.sourceCommit}\n\nReviewed snapshot SHA-256: ${snapshot.digest}`,
    tree: tree.sha, parents: previous ? [previous] : [],
    author: { name: "Source Backup", email: "source-backup@users.noreply.github.com" },
  });
  // Detect concurrent local work or a remote race before making the commit visible.
  if (collectSnapshot().digest !== snapshot.digest) throw new Error("Main changed during upload; prepare again. No branch updated.");
  const latest = await request(refPath, "GET", undefined, true);
  if ((latest?.object.sha ?? "") !== previous) throw new Error("Remote branch changed during upload; no branch updated.");
  if (previous) await request(`/git/refs/heads/${backupBranch}`, "PATCH", { sha: commit.sha, force: false });
  else await request("/git/refs", "POST", { ref: `refs/heads/${backupBranch}`, sha: commit.sha });
  // Persist recovery information immediately after the write, before verification.
  writeFileSync(`${outputDir}/pending-verification.json`, JSON.stringify({ commit: commit.sha, tree: tree.sha, sourceCommit: snapshot.sourceCommit }, null, 2));
  const verified = await request(refPath);
  const verifiedTree = await request(`/git/trees/${commit.sha}?recursive=1`);
  const actual = new Map(verifiedTree.tree.filter((x) => x.type === "blob").map((x) => [x.path, x]));
  if (verified.object.sha !== commit.sha || verifiedTree.truncated || actual.size !== entries.length ||
      entries.some((x) => actual.get(x.path)?.sha !== x.sha || actual.get(x.path)?.mode !== x.mode)) {
    throw new Error("Remote verification failed. Inspect pending-verification.json; do not retry blindly.");
  }
  const mainAfter = await request("/git/ref/heads/main");
  if (mainAfter.object.sha !== originalMain.object.sha) throw new Error("Remote main changed concurrently; inspect before recording completion.");
  gitText("config", "sourceBackup.lastCommit", commit.sha);
  const receipt = { repository, branch: backupBranch, commit: commit.sha, tree: tree.sha,
    sourceCommit: snapshot.sourceCommit, digest: snapshot.digest, files: entries.length,
    originalMain: mainAfter.object.sha, url: `https://github.com/${repository}/tree/${backupBranch}` };
  writeFileSync(`${outputDir}/receipt.json`, JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });