import { parseArgs } from "node:util";
import { isAbsolute } from "node:path";
import { decryptFile } from "./recovery-crypto.mjs";

try {
  const { values } = parseArgs({ options: { input: { type: "string" }, output: { type: "string" } } });
  if (!values.input || !values.output || !isAbsolute(values.input) || !isAbsolute(values.output))
    throw new Error("Absolute private input/output paths required.");
  await decryptFile(values.input, values.output, process.env.RECOVERY_BACKUP_PASSPHRASE);
  console.log("Authenticated archive decrypted. Keep plaintext private and remove after approved isolated restore.");
} catch {
  console.error("Decryption failed: check paths, permissions, passphrase and archive integrity. No new output published.");
  process.exitCode = 1;
}