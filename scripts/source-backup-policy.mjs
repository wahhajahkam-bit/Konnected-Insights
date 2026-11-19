import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export const repository = "ahkamkhalid-png/K-nnected-Insights";
export const backupBranch = "source-backup";
export const remoteName = "github-source";
const roots = new Set(["artifacts", "lib", "scripts"]);
const rootFiles = new Set([
  ".gitignore", ".npmrc", ".replit", ".replitignore", "package.json",
  "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "tsconfig.base.json",
  "replit.md",
]);
const docs = new Set([
  "docs/agent-monitoring-contract.md", "docs/agent-pricing-contract.md",
  "docs/source-backup.md", "docs/data-recovery.md",
]);
const publicTextFiles = new Set(["artifacts/konnected-insights/public/robots.txt"]);
const extensions = /\.(?:[cm]?[jt]sx?|json|md|css|html|ya?ml|toml|sql|sh|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf)$/i;
const forbidden = /(?:^|\/)(?:\.agents|\.local|\.cache|\.git|node_modules|dist|test-results|playwright-report|evidence|screenshots|attached_assets|reference|uploads|backups)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|p12|pfx|dump|sqlite3?|log|tsbuildinfo)$/i;

export function isIncluded(path) {
  if (forbidden.test(path)) return false;
  return rootFiles.has(path) || docs.has(path) || publicTextFiles.has(path) ||
    (roots.has(path.split("/")[0]) && (extensions.test(path) || path.endsWith("/.gitkeep")));
}

// Remove every workspace environment table, not just today's known variable names.
// The local .replit is never changed; restoration requires separately supplied settings.
export function sanitizeConfig(text) {
  let skip = false;
  return text.split("\n").filter((line) => {
    const section = line.match(/^\s*\[+([^\]]+)\]+\s*(?:#.*)?$/);
    if (section) skip = /^userenv(?:\.|$)/.test(section[1]);
    return !skip;
  }).join("\n");
}

export function scanText(path, text) {
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/,
    /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/,
    /\bAKIA[A-Z0-9]{16}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  ];
  if (patterns.some((pattern) => pattern.test(text))) throw new Error(`Credential-like content in ${path}; inspect privately before export.`);
  const urls = text.match(/postgres(?:ql)?:\/\/[^\s"'`<>]+/g) ?? [];
  for (const value of urls) {
    if (!value.includes("@")) continue;
    // Known synthetic test database URLs are not runtime credentials.
    const syntheticTest = /(?:test|spec)\.[cm]?[jt]sx?$/.test(path) &&
      /@(?:localhost|127\.0\.0\.1|example\.invalid)(?=[:/]|$)/.test(value);
    const guardFixture = path === "scripts/saved-source-test-guard.test.mjs" &&
      /^postgresql:\/\/fixture:unused@(?:helium|production\.example)\/(?:heliumdb|production)$/.test(value);
    if (!syntheticTest && !guardFixture) throw new Error(`Embedded database URL in ${path}; inspect privately before export.`);
  }
}

export const git = (...args) => execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 });
export const gitText = (...args) => git(...args).toString("utf8").trim();
export const blobHash = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

export function collectSnapshot() {
  if (gitText("branch", "--show-current") !== "main") throw new Error("Run only in the main workspace on main, after tasks are merged.");
  if (gitText("status", "--porcelain", "--untracked-files=no")) throw new Error("Commit or resolve tracked workspace changes before preparing a backup.");
  const sourceCommit = gitText("rev-parse", "refs/heads/main");
  const excluded = [];
  const entries = [];
  const records = git("ls-tree", "-rz", sourceCommit).toString("utf8").split("\0").filter(Boolean);
  for (const record of records) {
    const [meta, path] = record.split("\t");
    if (!isIncluded(path)) { excluded.push(path); continue; }
    const [mode, type, sha] = meta.split(" ");
    if (type !== "blob" || !["100644", "100755"].includes(mode)) throw new Error(`Unsupported source entry: ${path}`);
    let bytes = git("cat-file", "blob", sha);
    if (path === ".replit") bytes = Buffer.from(sanitizeConfig(bytes.toString("utf8")));
    if (bytes.length > 10 * 1024 * 1024) throw new Error(`Asset over 10 MiB requires review: ${path}`);
    if (!bytes.includes(0)) scanText(path, bytes.toString("utf8"));
    entries.push({ path, mode, bytes, sha: blobHash(bytes) });
  }
  const readme = Buffer.from(`# Könnected Insights — source backup

This branch contains reviewed source snapshots, not Replit's internal Git history.

See [backup and restoration instructions](docs/source-backup.md).
Secrets, workspace environment settings, private runtime/editorial data, database
contents, uploaded prompts, screenshots, and internal agent records are excluded.
Public website assets and published seed/fallback content remain part of the source.

Backups require a manual command. This is not automatic synchronization.
`);
  entries.push({ path: "README.md", mode: "100644", bytes: readme, sha: blobHash(readme) });
  entries.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const digest = createHash("sha256").update(JSON.stringify({
    sourceCommit,
    entries: entries.map(({path, mode, sha}) => ({path, mode, sha})),
  })).digest("hex");
  return { sourceCommit, digest, entries, excluded };
}