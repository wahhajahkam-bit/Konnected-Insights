import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repository, backupBranch, remoteName, gitText } from "./source-backup-policy.mjs";

// Local configuration only: safe to run on every main-workspace post-merge.
// It never authenticates, reads secrets, uploads files or changes existing remotes.
export function setupBackupRemote() {
  const url = `https://github.com/${repository}.git`;
  const configured = gitText("remote").split("\n").includes(remoteName);
  if (configured && gitText("remote", "get-url", remoteName) !== url) throw new Error("github-source remote points elsewhere.");
  if (!configured) gitText("remote", "add", remoteName, url);
  gitText("config", `remote.${remoteName}.pushurl`, "disabled://use-node-scripts-source-backup");
  gitText("config", "--replace-all", `remote.${remoteName}.fetch`, `+refs/heads/${backupBranch}:refs/remotes/${remoteName}/${backupBranch}`);
  let previous = "";
  try { previous = gitText("config", "--get", "sourceBackup.lastCommit"); } catch { /* new main workspace */ }
  const receiptPath = "docs/source-backup-receipt.json";
  if (!previous && existsSync(receiptPath)) {
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    if (receipt.repository !== repository || receipt.branch !== backupBranch || !/^[a-f0-9]{40}$/.test(receipt.commit)) {
      throw new Error("Invalid committed backup receipt; refusing to adopt a branch.");
    }
    gitText("config", "sourceBackup.lastCommit", receipt.commit);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.chdir(fileURLToPath(new URL("..", import.meta.url)));
  setupBackupRemote();
  console.log("Source-backup remote configured; no files uploaded.");
}