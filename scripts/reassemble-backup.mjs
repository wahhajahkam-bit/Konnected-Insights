#!/usr/bin/env node
// Reconstruct ciphertext only. Decryption is a separate authenticated operation.
import { createHash } from "node:crypto";
import { readFile, open, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateManifest } from "./runtime-backup-github.mjs";

export async function reassemble(directory, output) {
  const manifest = validateManifest(JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")));
  const target = await open(output, "wx", 0o600);
  const digest = createHash("sha256");
  let success = false;
  try {
    for (const chunk of manifest.chunks) {
      const buffer = await readFile(join(directory, chunk.name));
      if (buffer.length !== chunk.bytes ||
          createHash("sha256").update(buffer).digest("hex") !== chunk.sha256) {
        throw new Error("Chunk checksum mismatch; no output retained.");
      }
      digest.update(buffer);
      await target.writeFile(buffer);
    }
    if (digest.digest("hex") !== manifest.sha256) throw new Error("Archive checksum mismatch.");
    success = true;
  } finally {
    await target.close();
    if (!success) await rm(output, { force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, output] = process.argv.slice(2);
  if (!directory || !output || process.argv.length !== 4) {
    console.error("Usage: node scripts/reassemble-backup.mjs <snapshot-directory> <new-ciphertext-file>");
    process.exitCode = 1;
  } else reassemble(resolve(directory), resolve(output)).catch(() => {
    console.error("Reassembly failed. Check manifest, chunks and output path. Existing files are never overwritten.");
    process.exitCode = 1;
  });
}