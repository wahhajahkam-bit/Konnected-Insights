import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
const directory = await mkdtemp(resolve(tmpdir(), "agent-monitoring-tests-"));
try {
  for (const name of ["agentMonitoring.test", "agentMonitoring.integration.test", "agentMonitoring.http.test"]) {
    const outfile = resolve(directory, `${name}.cjs`);
    await build({
      entryPoints: [`src/lib/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs",
      alias: { "@clerk/express": resolve("src/lib/agentMonitoring.clerk-test-double.ts") },
    });
    const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit", env: { ...process.env, NODE_ENV: "production", EDITORIAL_OWNER_EMAIL: "" } });
    if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
  }
} finally { await rm(directory, { recursive: true, force: true }); }