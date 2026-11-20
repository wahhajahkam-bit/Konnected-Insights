import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { encryptStream, decryptFile, verifyEncryptedFile } from "./recovery-crypto.mjs";

const pass = "synthetic-only-test-passphrase-not-a-real-secret";
test("roundtrip, authentication, corruption, truncation, no overwrite and cleanup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "recovery-test-"));
  try {
    const input = Buffer.concat([Buffer.from('synthetic article {"media":"uuid"}\0'), Buffer.alloc(1024 * 1024, 123)]);
    const encrypted = join(dir, "archive.enc"), output = join(dir, "restored");
    await encryptStream(Readable.from([input]), encrypted, pass);
    await verifyEncryptedFile(encrypted, pass);
    await decryptFile(encrypted, output, pass);
    assert.deepEqual(await readFile(output), input);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    await assert.rejects(decryptFile(encrypted, output, pass));
    const bytes = await readFile(encrypted);
    const damaged = Buffer.from(bytes); damaged[60] ^= 1;
    const header = Buffer.from(bytes); header[12] ^= 1;
    const tag = Buffer.from(bytes); tag[tag.length - 1] ^= 1;
    for (const [name, data, password] of [
      ["wrong-passphrase", bytes, `${pass}-wrong`], ["ciphertext", damaged, pass],
      ["header", header, pass], ["tag", tag, pass],
      ["truncated", bytes.subarray(0, -1), pass], ["short", bytes.subarray(0, 15), pass],
    ]) {
      const file = join(dir, name);
      await writeFile(file, data);
      await assert.rejects(decryptFile(file, join(dir, "must-not-exist"), password));
      await assert.rejects(verifyEncryptedFile(file, password));
      assert.equal((await readdir(dir)).includes("must-not-exist"), false);
      assert.equal((await readdir(dir)).some(name => name.startsWith(".recovery-")), false);
    }
    await assert.rejects(encryptStream(Readable.from([input]), join(dir, "weak"), "short"));
    await assert.rejects(encryptStream(Readable.from([input]), join(dir, "failed-dump"), pass, async () => { throw new Error("dump failed"); }));
    assert.equal((await readdir(dir)).includes("failed-dump"), false);
    await encryptStream(Readable.from([]), join(dir, "empty.enc"), pass);
    await decryptFile(join(dir, "empty.enc"), join(dir, "empty"), pass);
    assert.equal((await stat(join(dir, "empty"))).size, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});