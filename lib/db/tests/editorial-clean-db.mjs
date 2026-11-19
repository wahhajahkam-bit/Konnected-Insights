import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const sourceDatabaseUrl = process.env.DATABASE_URL;

if (!sourceDatabaseUrl) {
  throw new Error("DATABASE_URL is required for the clean database test");
}

const databaseName = `editorial_cms_verify_${process.pid}_${Date.now()}`;
const temporaryUrl = new URL(sourceDatabaseUrl);
temporaryUrl.pathname = `/${databaseName}`;
const temporaryDatabaseUrl = temporaryUrl.toString();
const port = 19000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}/api/editorial`;
const adminPool = new pg.Pool({ connectionString: sourceDatabaseUrl });
let apiProcess;

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    env: process.env,
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
};

const request = async (pathname, options = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  return { status: response.status, body: await response.json() };
};

const waitForApi = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}?collection=talks`);
      if (response.ok) return;
    } catch {
      // The API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Temporary API did not become ready");
};

try {
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);

  run("pnpm", ["--filter", "@workspace/db", "run", "push-force"], {
    env: { ...process.env, DATABASE_URL: temporaryDatabaseUrl },
  });
  run("pnpm", ["--filter", "@workspace/api-server", "run", "build"]);

  apiProcess = spawn(
    process.execPath,
    [
      "--enable-source-maps",
      path.join(workspaceRoot, "artifacts/api-server/dist/index.mjs"),
    ],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        DATABASE_URL: temporaryDatabaseUrl,
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  await waitForApi();

  const talks = await request("?collection=talks");
  if (talks.status !== 200 || talks.body.data.length !== 11) {
    throw new Error("Approved editorial seed did not load on a clean database");
  }

  const created = await request("", {
    method: "POST",
    body: JSON.stringify({
      collection: "newsletters",
      slug: "clean-db-verification",
      title: "Clean DB Verification",
      status: "draft",
      sortOrder: 99,
      data: {
        category: "Test",
        excerpt: "Temporary verification content",
        url: "https://example.com/test",
        image: "/editorial/sourced/dubai-night.jpg",
        author: { name: "Verifier" },
      },
    }),
  });
  if (created.status !== 201) throw new Error("Clean database create failed");

  const published = await request(`/${created.body.data.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      expectedVersion: created.body.data.version,
      status: "published",
    }),
  });
  if (published.status !== 200) throw new Error("Clean database publish failed");

  const publicItem = await request("/newsletters/clean-db-verification");
  if (publicItem.status !== 200) {
    throw new Error("Published clean database item was not publicly readable");
  }

  const events = await request("?collection=events&includeDrafts=true");
  const event = events.body.data[0];
  const reorderBody = JSON.stringify({
    collection: "events",
    items: [{ id: event.id, expectedVersion: event.version }],
  });
  const reordered = await request("/reorder", {
    method: "POST",
    body: reorderBody,
  });
  if (reordered.status !== 200) throw new Error("Clean database reorder failed");

  const staleReorder = await request("/reorder", {
    method: "POST",
    body: reorderBody,
  });
  if (staleReorder.status !== 409) {
    throw new Error("Stale clean database reorder did not conflict");
  }

  const deleted = await request(`/${created.body.data.id}`, {
    method: "DELETE",
    body: JSON.stringify({ expectedVersion: published.body.data.version }),
  });
  if (deleted.status !== 200) throw new Error("Clean database delete failed");

  console.log(
    JSON.stringify({
      schemaProvisioned: true,
      seededTalks: talks.body.data.length,
      crudLifecycle: true,
      optimisticReorder: true,
      staleConflict: true,
      cleanup: true,
    }),
  );
} finally {
  if (apiProcess && apiProcess.exitCode === null) {
    apiProcess.kill("SIGTERM");
    await Promise.race([
      once(apiProcess, "exit"),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (apiProcess.exitCode === null) apiProcess.kill("SIGKILL");
  }

  if (/^editorial_cms_verify_[0-9]+_[0-9]+$/.test(databaseName)) {
    await adminPool.query(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    );
  }
  await adminPool.end();
}