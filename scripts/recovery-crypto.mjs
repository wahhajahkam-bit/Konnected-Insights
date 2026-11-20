import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, mkdtemp, chmod, copyFile, link, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Writable } from "node:stream";

// Fixed v1 layout: magic/version (8), salt (32), nonce (12), ciphertext, tag (16).
// Entire header is authenticated AAD. Fixed KDF parameters prevent hostile costs.
const MAGIC = Buffer.from("KNRB0001");
const HEADER = 52;
function key(passphrase, salt) {
  if (typeof passphrase !== "string" || passphrase.length < 24 || passphrase.length > 4096)
    throw new Error("Recovery passphrase must contain 24–4096 characters.");
  return scryptSync(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}
export function validatePassphrase(passphrase) {
  const k = key(passphrase, Buffer.alloc(32));
  k.fill(0);
}
async function staging(output, fn) {
  const dir = await mkdtemp(join(dirname(output), ".recovery-"));
  await chmod(dir, 0o700);
  try { return await fn(dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
}
export async function encryptStream(input, output, passphrase, beforePublish = async () => {}) {
  return staging(output, async dir => {
    const salt = randomBytes(32), nonce = randomBytes(12);
    const header = Buffer.concat([MAGIC, salt, nonce]);
    const k = key(passphrase, salt);
    const cipher = createCipheriv("aes-256-gcm", k, nonce);
    k.fill(0);
    cipher.setAAD(header);
    const temp = join(dir, "encrypted");
    const file = await open(temp, "wx", 0o600);
    await file.write(header);
    await file.close();
    await pipeline(input, cipher, createWriteStream(temp, { flags: "a", mode: 0o600 }));
    const tail = await open(temp, "a");
    try { await tail.write(cipher.getAuthTag()); await tail.sync(); }
    finally { await tail.close(); }
    await beforePublish();
    // Hard link publishes atomically without overwriting existing output/symlinks.
    await link(temp, output);
  });
}
export async function decryptFile(input, output, passphrase, verifyOnly = false) {
  return staging(output, async dir => {
    const snapshot = join(dir, "ciphertext");
    await copyFile(input, snapshot);
    await chmod(snapshot, 0o600);
    const file = await open(snapshot, "r");
    let header, tag, size;
    try {
      size = (await file.stat()).size;
      if (size < HEADER + 16) throw new Error("Truncated recovery archive.");
      header = Buffer.alloc(HEADER); tag = Buffer.alloc(16);
      await file.read(header, 0, HEADER, 0);
      await file.read(tag, 0, 16, size - 16);
    } finally { await file.close(); }
    if (!header.subarray(0, 8).equals(MAGIC)) throw new Error("Unsupported recovery archive format.");
    const k = key(passphrase, header.subarray(8, 40));
    const decode = () => {
      const cipher = createDecipheriv("aes-256-gcm", k, header.subarray(40));
      cipher.setAAD(header); cipher.setAuthTag(tag);
      return cipher;
    };
    const source = () => size === HEADER + 16
      ? Readable.from([])
      : createReadStream(snapshot, { start: HEADER, end: size - 17 });
    try {
      // First pass authenticates, discarding all plaintext in memory.
      await pipeline(source(), decode(), new Writable({ write(_chunk, _encoding, cb) { cb(); } }));
      if (verifyOnly) return;
      const temp = join(dir, "authenticated.dump");
      await pipeline(source(), decode(), createWriteStream(temp, { flags: "wx", mode: 0o600 }));
      await link(temp, output);
    } finally { k.fill(0); }
  });
}
export async function verifyEncryptedFile(filePath, passphrase) {
  // A private ciphertext snapshot prevents between-pass file changes.
  await decryptFile(filePath, filePath, passphrase, true);
}