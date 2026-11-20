import { test } from "node:test";
import assert from "node:assert/strict";
import { isIncluded, sanitizeConfig, scanText, blobHash } from "./source-backup-policy.mjs";

test("required source, config, tests and public assets are retained", () => {
  for (const path of ["pnpm-lock.yaml", ".replit", "artifacts/api-server/.replit-artifact/artifact.toml",
    "artifacts/api-server/src/lib/example.test.ts", "lib/db/migrations/future-work.sql",
    "artifacts/konnected-insights/public/original/dubai-skyline.jpg",
    "artifacts/konnected-insights/public/robots.txt", "scripts/source-backup.mjs",
    "docs/backup-decryption.md", "docs/github-backup-security.md"]) {
    assert.equal(isIncluded(path), true, path);
  }
});
test("internal records, runtime files and credential files are excluded", () => {
  for (const path of [".agents/memory/MEMORY.md", "attached_assets/a.jpg", "screenshots/a.png",
    "docs/insights-chat-verification.md", "artifacts/app/tests/evidence/a.md", "artifacts/app/.env",
    "artifacts/app/.env.production", "artifacts/app/uploads/a.jpg", "lib/db/backups/dump.sql",
    "artifacts/app/key.pem", "artifacts/app/node_modules/package/index.js"]) {
    assert.equal(isIncluded(path), false, path);
  }
});
test("export removes all userenv tables without removing neighboring configuration", () => {
  assert.equal(sanitizeConfig("modules = []\n[userenv]\n[userenv.shared]\nPRIVATE = 'x'\n[userenv.production]\nX = 'y'\n[[ports]]\nlocalPort = 8080\n"),
    "modules = []\n[[ports]]\nlocalPort = 8080\n");
});
test("credential checks fail closed without including matched values in errors", () => {
  const token = "ghp_" + "a".repeat(36);
  assert.throws(() => scanText("src/a.ts", token), /Credential-like content in src\/a.ts/);
  assert.throws(() => scanText("src/a.ts", "postgres" + "://name:secret@db.example/app"), /Embedded database URL/);
  assert.doesNotThrow(() => scanText("src/a.test.ts", "postgres://test:test@localhost/test"));
});
test("blob hashes use Git object framing", () => {
  assert.equal(blobHash(Buffer.from("")), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
});