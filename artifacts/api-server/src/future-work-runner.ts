// Scheduled-deployment entry point: runs due durable work once, then exits.
// --manual=2030 --limit=1 is an explicit bounded live research operation.
import { pool } from "@workspace/db";
import { claimResearchRun, claimSelectedResearch, researchInput, executeResearchRun, tickFutureWorkSchedules } from "./lib/futureWorkResearch";
import { refreshStale } from "./lib/futureWorkStore";

async function main() {
  await refreshStale();
  const manual = process.argv.find(v => v.startsWith("--manual="))?.split("=")[1];
  if (manual) {
    if (!["2030","2050","2100","programs","news"].includes(manual)) throw new Error("Invalid schedule");
    const limit = Number(process.argv.find(v => v.startsWith("--limit="))?.split("=")[1] ?? 1);
    if (!Number.isInteger(limit) || limit < 1 || limit > 4) throw new Error("Manual limit must be 1–4");
    const functionSlug = process.argv.find(v=>v.startsWith("--function="))?.slice("--function=".length);
    const fn = functionSlug ? (await pool.query("SELECT id FROM future_work_functions WHERE slug=$1 AND enabled",[functionSlug])).rows[0] : undefined;
    if (functionSlug && !fn) throw new Error("Selected function does not exist or is disabled");
    const run = fn
      ? await claimSelectedResearch(researchInput.parse({functionIds:[fn.id],categories:[manual]}),"operator-cli")
      : await claimResearchRun(manual,limit,"operator-cli");
    console.log(`Research run ${run.id} started`);
    await executeResearchRun(run.id);
    const result = (await pool.query("SELECT id,status,processed,sources_found,sources_accepted,sources_rejected,errors,results,usage FROM research_log WHERE id=$1", [run.id])).rows[0];
    console.log(JSON.stringify(result,null,2));
    if (result.status !== "completed") process.exitCode = 1;
  } else await tickFutureWorkSchedules();
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(()=>pool.end());