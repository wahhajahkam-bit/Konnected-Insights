import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { eligiblePublishedProgram } from "./futureWorkPolicy";
import { project, publicFields, type KnowledgeSource } from "./insightsChat";

// These are the actual public page headers/introductory copy, not invented
// collection records. They remain available even when a collection is empty.
export const navigationKnowledge: KnowledgeSource[] = [
  ["/", "Könnected Insights", "Könnected Insights"],
  ["/bigger-picture", "Bigger Picture", "Könnected Insights exists to document, debate, and direct this transition. This is not about predicting the future. It is about equipping operators, investors, and leaders with the intellectual framework required to build it."],
  ["/future-of-work", "Future of Work", "Start with your business function. Explore evidence-backed outlooks for 2030, structural forecasts for 2050, and speculative scenarios for 2100."],
  ["/newsletters", "Newsletters", "Curated insights and essential dispatches from our network."],
  ["/masterclass-series", "Masterclass Series", "The 5-to-10 year horizon. Tactical foresight from those actively shaping the transition."],
  ["/contributors", "Contributors", "The minds building what comes next. An expanding network of operators, investors, and thinkers."],
  ["/communities", "Communities", "Active groups driving specific transformations. Where our ecosystem collaborates, debates, and builds."],
  ["/events", "Events", "Upcoming gatherings and a record of where the network has met before."],
  ["/talks", "Talks", "Explore insights, strategies, and perspectives from our network of experts."],
].map(([url, title, text]) => ({
  id: `navigation:${url}`, url, title, text, category: "navigation", date: null, stale: false,
}));

// Reads are deliberately uncached. Each collection is capped independently so a
// large newsletter collection cannot crowd every other public content type out.
export async function loadPublicKnowledge(): Promise<KnowledgeSource[]> {
  const sources: KnowledgeSource[] = navigationKnowledge.map(source => ({ ...source }));
  for (const category of ["newsletters", "masterclasses", "future-work", "events", "talks", "contributors", "communities"]) {
    const fields = publicFields[category].map(key => key === "sections"
      ? `'sections',CASE WHEN jsonb_typeof(data->'sections')='array' THEN
          (SELECT jsonb_agg(jsonb_build_object(
            'title',CASE WHEN jsonb_typeof(section->'title')='string' THEN left(section->>'title',180) END,
            'text',CASE WHEN jsonb_typeof(section->'text')='string' THEN left(section->>'text',600) END))
          FROM (SELECT section FROM jsonb_array_elements(data->'sections') section LIMIT 8) bounded_sections) END`
      : key === "authorName"
      ? `'authorName',CASE WHEN jsonb_typeof(data->'authorName')='string' THEN left(data->>'authorName',180)
          WHEN jsonb_typeof(data->'author'->'name')='string' THEN left(data->'author'->>'name',180) END`
      : `'${key}',CASE WHEN jsonb_typeof(data->'${key}')='string' THEN left(data->>'${key}',1000) END`).join(",");
    const rows = (await pool.query(`SELECT id,slug,left(title,180) title,updated_at AS date,
      jsonb_build_object(${fields}) AS data FROM editorial_items
      WHERE collection=$1 AND status='published' ORDER BY updated_at DESC,id LIMIT 150`, [category])).rows;
    sources.push(...rows.map(row => project({ ...row, category })));
  }
  const functions = (await pool.query(`SELECT id,slug,left(name,180) title,
    jsonb_build_object('description',left(description,1000)) data
    FROM future_work_functions WHERE enabled ORDER BY sort_order,id LIMIT 100`)).rows;
  sources.push(...functions.map(row => project({ ...row, category: "functions" })));
  for (const [category, table] of Object.entries({
    content: "future_of_work_content", programs: "leading_programs", news: "future_work_news",
  })) {
    const fields = publicFields[category].map(key => key === "skills"
      ? `'skills',CASE WHEN jsonb_typeof(v.data->'skills')='array' THEN
        (SELECT jsonb_agg(left(skill #>> '{}',120)) FROM
          (SELECT skill FROM jsonb_array_elements(v.data->'skills') skill
           WHERE jsonb_typeof(skill)='string' LIMIT 12) bounded_skills) END`
      : `'${key}',CASE WHEN jsonb_typeof(v.data->'${key}')='string' THEN left(v.data->>'${key}',1000) END`).join(",");
    const rows = (await pool.query(`SELECT v.id,f.slug,
      left(concat(f.name,' · ',coalesce(v.data->>'title',v.data->>'programName',$1),
        CASE WHEN $1='content' THEN concat(' · ',v.horizon,' · ',v.lens) ELSE '' END),180) title,
      v.last_verified_at AS date,
      (v.stale OR v.last_verified_at IS NULL OR v.last_verified_at < now() -
        coalesce(s.stale_after_days,30) * interval '1 day') AS stale,
      jsonb_build_object(${fields}) data
      ${category === "programs" ? ",v.data AS eligibility" : ""}
      FROM ${table} v JOIN future_work_functions f ON f.id=v.function_id
      LEFT JOIN future_work_schedules s ON s.id=${category === "content" ? "v.horizon::text" : "$1"}
      WHERE v.status='published' AND f.enabled ORDER BY v.updated_at DESC,v.id LIMIT 200`, [category])).rows;
    sources.push(...rows.filter(row => category !== "programs" || eligiblePublishedProgram(row.eligibility))
      .map(row => project({ ...row, category })));
  }
  return sources;
}
export class ChatLimitError extends Error {
  constructor(public code: string, public status = 429) { super(code); }
}
// All replicas use the same PostgreSQL lock namespace and durable usage table.
// Anonymous browser identifiers are hashed before storage; no questions, cookie
// signatures, IP addresses or conversation histories are persisted. Cookie
// resets cannot bypass the global durable cost ceiling.
export async function acquireChatBudget(clientIdentity: string, connect = () => pool.connect()): Promise<() => Promise<void>> {
  const client = await connect();
  let slot: number | undefined;
  const clientKey = `insights-chat:client:${createHash("sha256").update(clientIdentity).digest("hex")}`;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout='3000ms'");
    await client.query("SELECT pg_advisory_xact_lock(760076,0)");
    const usage = (await client.query(`SELECT
      count(*) FILTER (WHERE user_id='insights-chat:global' AND used_at>now()-interval '1 minute')::int AS "minute",
      count(*) FILTER (WHERE user_id='insights-chat:global')::int AS "day",
      count(*) FILTER (WHERE user_id=$1 AND used_at>now()-interval '1 minute')::int client_minute,
      count(*) FILTER (WHERE user_id=$1)::int client_day
      FROM ai_generation_usage WHERE user_id IN ('insights-chat:global',$1)
      AND used_at>now()-interval '24 hours'`, [clientKey])).rows[0];
    if (usage.minute >= 30 || usage.day >= 500) throw new ChatLimitError("GLOBAL_RATE_LIMIT");
    if (usage.client_minute >= 6 || usage.client_day >= 50) throw new ChatLimitError("CLIENT_RATE_LIMIT");
    for (let i = 1; i <= 4; i++) {
      if ((await client.query("SELECT pg_try_advisory_lock(760076,$1) AS acquired", [i])).rows[0].acquired) {
        slot = i; break;
      }
    }
    if (slot === undefined) throw new ChatLimitError("CHAT_BUSY");
    await client.query("INSERT INTO ai_generation_usage(user_id) VALUES ('insights-chat:global'),($1) RETURNING id", [clientKey]);
    await client.query("COMMIT");
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      try { await client.query("SELECT pg_advisory_unlock(760076,$1)", [slot]); }
      catch { client.release(true); return; }
      client.release();
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
      if (slot !== undefined) await client.query("SELECT pg_advisory_unlock(760076,$1)", [slot]);
      client.release();
    } catch { client.release(true); }
    throw error;
  }
}