import { test, after } from "node:test";
import "./futureWorkPreflight.test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { horizons, nextRunAt, sourceEvidence, publisherIdentity, programClassifierInstructions, validResearchEvidence, eligiblePublishedProgram, futureWorkReviewInput, researchSourcesSchema, isWithinResearchSources } from "./futureWorkPolicy";
import { extractEditorialSource } from "./editorialSource";
import { readPortal, reviewVersion, tables, version, refreshStale } from "./futureWorkStore";
import { acceptEvidence, claimResearchRun, processCombination, recoverResearchRuns, planResearch, researchInput, researchQuery, combinationCategory, executeResearchRun, combinationBudget, checkRunBudget } from "./futureWorkResearch";

after(async()=>{ await pool.end(); });
test("per-combination budget isolates prior tokens/calls and ignores query markers",()=>{
  const usage=[
    ...Array.from({length:20},()=>({stage:"provider_call",combinationIndex:0})),
    {stage:"search",combinationIndex:0,total_tokens:300_000},
    {stage:"search_attempt",combinationIndex:1},
    {stage:"provider_call",combinationIndex:1},
    {stage:"search",combinationIndex:1,total_tokens:20},
  ];
  assert.deepEqual(combinationBudget(usage,0),{calls:20,tokens:300_000});
  assert.deepEqual(combinationBudget(usage,1),{calls:1,tokens:20});
});
test("durable item budget blocks same-item requests, charges legacy once, and continues later items",async()=>{
  const plan=planResearch([{id:randomUUID(),name:"Budget fixture"}],{categories:["news","programs"]});
  const run=(await pool.query("INSERT INTO research_log(schedule_id,lease_until,plan,usage) VALUES('news',now()+interval '5 minutes',$1,$2) RETURNING *",
    [JSON.stringify(plan),JSON.stringify([{stage:"search",total_tokens:100_001}])])).rows[0];
  try {
    await assert.rejects(checkRunBudget(run.id,"search"),/budget exhausted/);
    let row=(await pool.query("SELECT * FROM research_log WHERE id=$1",[run.id])).rows[0];
    assert.equal(row.usage[0].combinationIndex,0);
    assert.equal(row.usage[0].legacyAccounting,true);
    assert.equal(row.usage.filter((u:any)=>u.stage==="provider_call").length,0);
    const visited:string[]=[];
    await executeResearchRun(run.id,async(c)=>{
      visited.push(c.kind);
      for(let i=0;i<20;i++) await checkRunBudget(run.id,"search");
      await assert.rejects(checkRunBudget(run.id,"search"),/budget exhausted/);
      return {combination:c,outcome:"nothing_found",searchQuery:researchQuery(c),attempts:[],result:"Controlled no-result",rejected:[]};
    });
    row=(await pool.query("SELECT * FROM research_log WHERE id=$1",[run.id])).rows[0];
    assert.deepEqual(visited,["programs"]);
    assert.equal(row.results[0].outcome,"skipped");
    assert.equal(row.results[0].attempts.length,0);
    assert.equal(row.results[1].outcome,"nothing_found");
    assert.equal(row.processed,2);
    assert.deepEqual(combinationBudget(row.usage,1),{calls:20,tokens:0});
  } finally { await pool.query("DELETE FROM research_log WHERE id=$1",[run.id]); }
});
test("all selectors plan eight combinations per function; target/category/topic validation",()=>{
  const configured={urls:["https://mit.edu/research"],instructions:"Focus on treasury leadership."};
  const functions=[{id:randomUUID(),name:"Finance",research_sources:configured},{id:randomUUID(),name:"HR"}];
  const all=planResearch(functions,researchInput.parse({}));
  assert.equal(all.length,16);
  assert.deepEqual([...new Set(all.map(combinationCategory))],["2030","2050","2100","news","programs"]);
  const targeted=planResearch(functions,researchInput.parse({functionIds:[functions[0].id],categories:["news"],topic:"  risk modeling  "}));
  assert.equal(targeted.length,1);
  assert.equal(targeted[0].topic,"risk modeling");
  assert.deepEqual(targeted[0].researchSources,configured,"private source configuration is snapshotted into every targeted plan item");
  assert.match(researchQuery(targeted[0]),/Finance.*risk modeling/);
  for(const input of [{functionIds:[]},{categories:[]},{functionIds:["bad"]},{topic:"x".repeat(501)}]) assert.throws(()=>researchInput.parse(input));
});
test("research source contract is bounded and URL roots are enforced deterministically",()=>{
  const configured=researchSourcesSchema.parse({urls:["https://mit.edu/research/"],instructions:"Only treasury implications"});
  assert.equal(isWithinResearchSources("https://mit.edu/research/report?edition=1",configured),true);
  assert.equal(isWithinResearchSources("https://mit.edu/researcher/report",configured),false);
  assert.equal(isWithinResearchSources("https://other.mit.edu/research/report",configured),false);
  assert.equal(isWithinResearchSources("https://mit.edu/unrelated",configured),false);
  assert.throws(()=>researchSourcesSchema.parse({urls:Array.from({length:11},(_,i)=>`https://mit.edu/${i}`),instructions:""}));
  assert.throws(()=>researchSourcesSchema.parse({urls:["file:///etc/passwd"],instructions:""}));
  assert.throws(()=>researchSourcesSchema.parse({urls:[],instructions:"x".repeat(4001)}));
});
const text = "AI systems change finance leaders' professional responsibilities and require evidence assessment. ".repeat(15);
const fixtureSource = (url = "https://www.mckinsey.com/fixture", date = new Date().toISOString()) => ({
  url, date, title: "Controlled development evidence", description: "Test-only evidence", text,
});
test("fixed horizon labels, speculative disclaimer, cadence, windows, publisher identity", () => {
  assert.deepEqual(horizons.map(v=>v.year),[2030,2050,2100]);
  assert.match(horizons[2].disclaimer,/expert speculation, not a forecast/);
  assert.equal(nextRunAt("2030",new Date("2026-01-01Z")).toISOString(),"2026-02-01T00:00:00.000Z");
  assert.equal(nextRunAt("2050",new Date("2026-01-01Z")).toISOString(),"2026-07-01T00:00:00.000Z");
  assert.equal(nextRunAt("2100",new Date("2026-01-01Z")).toISOString(),"2027-01-01T00:00:00.000Z");
  assert.equal(nextRunAt("news",new Date("2026-01-01Z")).toISOString(),"2026-01-08T00:00:00.000Z");
  assert.equal(publisherIdentity("https://sub.mckinsey.com/a"),"mckinsey.com");
  assert.equal(publisherIdentity("https://mckinsey.com.spam.example/a"),null);
  const now = new Date("2026-09-19Z");
  assert.throws(()=>sourceEvidence(fixtureSource(undefined,"2024-12-01"),12,now),/window/);
  assert.equal(sourceEvidence(fixtureSource(undefined,"2024-12-01"),24,now).publishedAt,"2024-12-01T00:00:00.000Z");
  assert.throws(()=>sourceEvidence({...fixtureSource(),date:undefined},24,now),/unavailable/);
  assert.throws(()=>sourceEvidence(fixtureSource(undefined,"2030-01-01"),24,now),/window/);
  assert.throws(()=>sourceEvidence(fixtureSource("https://anonymous.example/article"),24),/Unverified/);
  assert.match(programClassifierInstructions,/"AI for Finance Leaders"/);
  assert.match(programClassifierInstructions,/"Finance for Non-Finance Managers"/);
});
test("durable mixed-category execution continues after errors and resumes checkpoints without repeating",async()=>{
  const plan=planResearch([{id:randomUUID(),name:"Disabled fixture"}],{categories:["2030","2100","news"],topic:"skills"});
  const run=(await pool.query("INSERT INTO research_log(schedule_id,lease_until,requested_by,plan) VALUES('2030',now()+interval '5 minutes','fixture-test',$1) RETURNING *",[JSON.stringify(plan)])).rows[0];
  const visited:string[]=[];
  const processor:typeof processCombination=async(c,s)=>{
    visited.push(combinationCategory(c));
    assert.equal(s.id,combinationCategory(c));
    if(c.horizon===2030 && c.kind==="content") throw new Error("Controlled independent item failure");
    return {combination:c,outcome:"nothing_found",searchQuery:researchQuery(c),attempts:[],result:"No qualifying sources",rejected:[]};
  };
  try {
    await executeResearchRun(run.id,processor);
    const row=(await pool.query("SELECT * FROM research_log WHERE id=$1",[run.id])).rows[0];
    assert.equal(row.status,"completed_with_errors");
    assert.equal(row.processed,plan.length);
    assert.equal(row.results.filter((r:any)=>r.outcome==="failed").length,2);
    assert.equal(row.results.filter((r:any)=>r.outcome==="nothing_found").length,3);
    assert.deepEqual(visited,["2030","2030","2100","2100","news"]);
    await executeResearchRun(run.id,processor);
    assert.equal(visited.length,plan.length);
  } finally { await pool.query("DELETE FROM research_log WHERE id=$1",[run.id]); }
});
test("news auto-publication checkpoints atomically and identical syndicated evidence adds no version",async()=>{
  const fn=(await pool.query("INSERT INTO future_work_functions(slug,name,enabled) VALUES($1,'Disabled news fixture',false) RETURNING *",[`test-fw-${randomUUID()}`])).rows[0];
  const combo={functionId:fn.id,name:fn.name,horizon:2030,lens:"technology",kind:"news" as const};
  const runIds:string[]=[];
  const proposal={title:"Test finance systems",summary:"Finance leaders evaluate emerging systems. Evidence assessment supports responsible decisions.",skills:[],
    organization:"",programName:"",description:"",classification:"uncertain" as const,rationale:"Test-only controlled evidence",relevant:true,supportingQuotes:[text.slice(0,90)]};
  try {
    for(let i=0;i<2;i++){
      const run=(await pool.query("INSERT INTO research_log(schedule_id,lease_until,plan) VALUES('news',now()+interval '5 minutes',$1) RETURNING *",[JSON.stringify([combo])])).rows[0];
      runIds.push(run.id);
      const source=fixtureSource(`https://mit.edu/news-fixture-${i}`);
      const result=await processCombination(combo,{source_window_months:1},run.id,{search:async()=>[source.url],fetch:async()=>source,summarize:async()=>proposal},i===0?0:undefined);
      assert.equal(result.outcome,i===0?"published":"unchanged");
      if(i===0){
        const durable=(await pool.query("SELECT * FROM research_log WHERE id=$1",[run.id])).rows[0];
        assert.equal(durable.processed,1);
        assert.equal(durable.results[0].outcome,"published");
        assert.equal(durable.results[0].versionId,result.versionId);
      }
      await pool.query("UPDATE research_log SET status='completed' WHERE id=$1",[run.id]);
    }
    assert.equal((await pool.query("SELECT count(*) FROM future_work_news WHERE function_id=$1",[fn.id])).rows[0].count,"1");
    assert.equal((await readPortal()).news.some((r:any)=>r.functionId===fn.id),false,"disabled fixture never leaks publicly");
  } finally {
    await pool.query("DELETE FROM future_work_decisions WHERE version_id IN (SELECT id FROM future_work_news WHERE function_id=$1)",[fn.id]);
    await pool.query("DELETE FROM future_work_news WHERE function_id=$1",[fn.id]);
    await pool.query("DELETE FROM future_work_functions WHERE id=$1",[fn.id]);
    await pool.query("DELETE FROM future_work_evidence WHERE run_id=ANY($1::uuid[])",[runIds]);
    await pool.query("DELETE FROM research_log WHERE id=ANY($1::uuid[])",[runIds]);
  }
});
test("publication date comes from actual metadata, not visible speculation or updated date",()=>{
  const source = extractEditorialSource('<script type="application/ld+json">{"@graph":[{"datePublished":"2026-08-01","dateModified":"2026-09-19"}]}</script><p>Published in 2100</p>',"text/html",new URL("https://mit.edu/article"));
  assert.equal(source.date,"2026-08-01");
  const undated = extractEditorialSource("<p>Experts discuss the year 2030.</p>","text/html",new URL("https://mit.edu/article"));
  assert.equal(undated.date,"");
});
test("database lifecycle, evidence gates, draft privacy, shared skills and reversible history", async () => {
  const slug = `test-fw-${randomUUID()}`;
  const fn = (await pool.query("INSERT INTO future_work_functions(slug,name,enabled) VALUES($1,'Synthetic test function',true) RETURNING *",[slug])).rows[0];
  const ids: string[] = [];
  const evidence = sourceEvidence(fixtureSource(),12);
  const insert = async (horizon:number,lens:string,kind:keyof typeof tables="content",data:Record<string,any>={}) => {
    const row = (await pool.query(`INSERT INTO ${tables[kind]}(function_id,horizon,lens,slot,data,last_verified_at)
      VALUES($1,$2,$3,$4,$5,now()) RETURNING *`,[fn.id,horizon,lens,`${fn.id}:${kind}:${horizon}:${lens}`,
      {title:"Test evidence title",summary:"Synthetic fixture supports finance research. This is test content only.",skills:["Evidence assessment"],sources:[evidence],...data}])).rows[0];
    ids.push(row.id); return row;
  };
  try {
    const six = [];
    for (const h of [2030,2050,2100]) for (const l of ["technology","field"]) six.push(await insert(h,l));
    const publicBefore = await readPortal();
    assert.equal(publicBefore.content.some((r:any)=>r.functionId===fn.id),false);
    assert.equal((await readPortal(true)).content.filter((r:any)=>r.functionId===fn.id).length,6);
    // Synthetic approved fixtures are deactivated before approval, never publicly displayed.
    await pool.query("UPDATE future_work_functions SET enabled=false WHERE id=$1",[fn.id]);
    for (const row of six) await reviewVersion("content",row.id,{revision:1,action:"approve"},"fixture-editor");
    const published = (await pool.query("SELECT * FROM future_of_work_content WHERE id=$1",[six[0].id])).rows[0];
    assert.equal(version(published).status,"published");
    assert.equal(version(published).programName,undefined);
    const edited = await reviewVersion("content",published.id,{revision:published.revision,action:"edit",changes:{skills:["Model risk evaluation"]}},"fixture-editor");
    ids.push(edited.id);
    assert.equal(edited.status,"pending_review");
    const approvedBefore = (await pool.query("SELECT data FROM future_of_work_content WHERE id=$1",[published.id])).rows[0];
    assert.deepEqual(approvedBefore.data.skills,["Evidence assessment"]);
    await assert.rejects(reviewVersion("content",published.id,{revision:published.revision,action:"unpublish"},"fixture-editor"),/changed/);
    const newApproved = await reviewVersion("content",edited.id,{revision:edited.revision,action:"approve"},"fixture-editor");
    assert.deepEqual(newApproved.skills,["Model risk evaluation"]);
    const old = (await pool.query("SELECT * FROM future_of_work_content WHERE id=$1",[published.id])).rows[0];
    assert.equal(old.status,"unpublished");
    const restored = await reviewVersion("content",old.id,{revision:old.revision,action:"restore"},"fixture-editor");
    assert.deepEqual(restored.skills,["Evidence assessment"]);
    await assert.rejects(reviewVersion("content",edited.id,{revision:newApproved.revision,action:"restore"},"fixture-editor"),/changed/);
    const rejected = await reviewVersion("content",restored.id,{revision:restored.revision,action:"edit",changes:{title:"Rejected fixture variation"}},"fixture-editor");
    ids.push(rejected.id);
    await reviewVersion("content",rejected.id,{revision:1,action:"reject"},"fixture-editor");
    await assert.rejects(reviewVersion("content",rejected.id,{revision:2,action:"restore"},"fixture-editor"),/previously approved/);
    const uncertain = await insert(2030,"field","programs",{organization:"Fixture University",programName:"Leadership Academy",description:"Uncertain curriculum",classification:"uncertain"});
    await assert.rejects(reviewVersion("programs",uncertain.id,{revision:1,action:"approve"},"fixture-editor"),/future-focused/);
    const accepted = await insert(2030,"technology","programs",{organization:"Fixture University",programName:"AI for Finance Leaders",description:"Future-focused curriculum",classification:"accept",relevant:true});
    await reviewVersion("programs",accepted.id,{revision:1,action:"approve"},"fixture-editor");
    const noEvidence = await insert(2050,"technology","news",{sources:[]});
    await assert.rejects(reviewVersion("news",noEvidence.id,{revision:1,action:"approve"},"fixture-editor"),/evidence/);
    await pool.query("UPDATE future_of_work_content SET last_verified_at=now()-interval '400 days' WHERE id=$1",[restored.id]);
    await readPortal(true);
    const stale = (await pool.query("SELECT * FROM future_of_work_content WHERE id=$1",[restored.id])).rows[0];
    assert.equal(stale.status,"published"); assert.equal(stale.stale,true);
    assert.equal((await readPortal()).programs.some((v:any)=>v.functionId===fn.id),false);
  } finally {
    await pool.query("DELETE FROM future_work_decisions WHERE version_id=ANY($1::uuid[])",[ids]);
    for (const table of Object.values(tables)) await pool.query(`DELETE FROM ${table} WHERE function_id=$1`,[fn.id]);
    await pool.query("DELETE FROM future_work_functions WHERE id=$1",[fn.id]);
  }
});
test("durable source cap, no-source/inaccessible paths, leases, recovery and nonoverlap",async()=>{
  const run = (await pool.query("INSERT INTO research_log(schedule_id,lease_until,requested_by) VALUES('2030',now()+interval '5 minutes','fixture-test') RETURNING *")).rows[0];
  const schedule = (await pool.query("SELECT * FROM future_work_schedules WHERE id='2030'")).rows[0];
  const fn = (await pool.query("INSERT INTO future_work_functions(slug,name,enabled) VALUES($1,'Synthetic source failure fixture',false) RETURNING *",[`test-fw-${randomUUID()}`])).rows[0];
  const combo = {functionId:fn.id,name:"Finance",horizon:2030,lens:"technology",kind:"content" as const};
  try {
    await acceptEvidence(run.id,sourceEvidence(fixtureSource("https://mckinsey.com/fixture-a"),12));
    await acceptEvidence(run.id,sourceEvidence(fixtureSource("https://sub.mckinsey.com/fixture-b"),12));
    await assert.rejects(acceptEvidence(run.id,sourceEvidence(fixtureSource("https://mckinsey.com/fixture-c"),12)),/diversity cap/);
    await assert.rejects(claimResearchRun("2030",1,"fixture-test"),/active/);
    const impossibleSummary = async (): Promise<never> => { throw new Error("Must not generate without qualifying evidence"); };
    const noSource = await processCombination(combo,schedule,run.id,{search:async()=>[],fetch:async()=>{throw new Error("must not fetch");},summarize:impossibleSummary});
    assert.equal(noSource.outcome,"nothing_found");
    const unavailable = await processCombination(combo,schedule,run.id,{search:async()=>["https://mit.edu/fixture"],fetch:async()=>{throw new Error("HTTP 403");},summarize:impossibleSummary});
    assert.match(unavailable.rejected[0].reason,/403/);
    const events:string[]=[];
    const restricted={...combo,researchSources:{urls:["https://mit.edu/allowed"],instructions:"Narrow to this report series"}};
    const constrained = await processCombination(restricted,schedule,run.id,{
      search:async()=>{ events.push("search"); return ["https://mckinsey.com/unrelated"]; },
      fetch:async()=>{ events.push("direct-fetch"); return fixtureSource("https://mit.edu/outside-after-redirect"); },
      summarize:impossibleSummary,
    });
    assert.deepEqual(events,["direct-fetch","search"],"configured page is fetched before constrained discovery");
    assert.match(constrained.rejected[0].reason,/redirected outside/i);
    assert.match(constrained.rejected[1].reason,/outside the configured/i);
    assert.equal(constrained.outcome,"nothing_found","restricted research never falls back to unrelated sources");
    await pool.query("UPDATE research_log SET lease_until=now()-interval '1 minute',plan='[]' WHERE id=$1",[run.id]);
    await recoverResearchRuns();
    const recovered = (await pool.query("SELECT * FROM research_log WHERE id=$1",[run.id])).rows[0];
    assert.equal(recovered.status,"completed"); assert.equal(recovered.attempts,2);
    await pool.query("UPDATE research_log SET status='running',attempts=3,lease_until=now()-interval '1 minute' WHERE id=$1",[run.id]);
    await recoverResearchRuns();
    assert.equal((await pool.query("SELECT status FROM research_log WHERE id=$1",[run.id])).rows[0].status,"failed");
    assert.equal((await pool.query("SELECT next_run_at FROM future_work_schedules WHERE id='2030'")).rows[0].next_run_at.toISOString(),schedule.next_run_at.toISOString());
  } finally {
    await pool.query("DELETE FROM future_work_evidence WHERE run_id=$1",[run.id]);
    await pool.query("DELETE FROM research_log WHERE id=$1",[run.id]);
    await pool.query("DELETE FROM future_work_functions WHERE id=$1",[fn.id]);
  }
});
test("real-fetch-shaped verification is opt-in, hash-matched, and never promotes changed claims",async()=>{
  const fn = (await pool.query("INSERT INTO future_work_functions(slug,name,enabled) VALUES($1,'Synthetic verification fixture',false) RETURNING *",[`test-fw-${randomUUID()}`])).rows[0];
  const runIds:string[] = [];
  const evidence = sourceEvidence(fixtureSource(),12);
  const proposal = {title:"Synthetic finance future",summary:"Finance leaders evaluate emerging systems. Evidence assessment supports responsible decisions.",skills:["Evidence assessment"],
    organization:"",programName:"",description:"",classification:"uncertain" as const,rationale:"Controlled test fixture",relevant:true,supportingQuotes:[text.slice(0,90)]};
  const original = (await pool.query(`INSERT INTO future_of_work_content(function_id,slot,data,last_verified_at)
    VALUES($1,$2,$3,now()-interval '40 days') RETURNING *`,[fn.id,`${fn.id}:content:2030:technology`,{...proposal,sources:[evidence]}])).rows[0];
  const combo = {functionId:fn.id,name:fn.name,horizon:2030,lens:"technology",kind:"content" as const};
  const newRun = async()=>{
    const row = (await pool.query("INSERT INTO research_log(schedule_id,lease_until,requested_by) VALUES('2030',now()+interval '5 minutes','fixture-test') RETURNING *")).rows[0];
    runIds.push(row.id); return row;
  };
  try {
    await reviewVersion("content",original.id,{revision:1,action:"approve"},"fixture-editor");
    const deps = {search:async()=>[evidence.url],fetch:async()=>fixtureSource(),summarize:async()=>proposal};
    const first = await newRun();
    await processCombination(combo,{source_window_months:12,verification_only_opt_in:false},first.id,deps);
    const untouched = (await pool.query("SELECT * FROM future_of_work_content WHERE id=$1",[original.id])).rows[0];
    assert.equal(untouched.last_verified_at.toISOString(),original.last_verified_at.toISOString());
    const candidate = (await pool.query("SELECT * FROM future_of_work_content WHERE function_id=$1 AND status='pending_review'",[fn.id])).rows[0];
    assert.equal(candidate,undefined,"identical evidence must not produce another draft");
    await pool.query("UPDATE research_log SET status='completed' WHERE id=$1",[first.id]);
    const second = await newRun();
    await processCombination(combo,{source_window_months:12,verification_only_opt_in:true},second.id,deps);
    const refreshed = (await pool.query("SELECT * FROM future_of_work_content WHERE id=$1",[original.id])).rows[0];
    assert.ok(refreshed.last_verified_at > untouched.last_verified_at);
    assert.equal(refreshed.data.summary,untouched.data.summary);
    assert.deepEqual(refreshed.data.skills,untouched.data.skills);
    await pool.query("UPDATE research_log SET status='completed' WHERE id=$1",[second.id]);
    const third = await newRun();
    await processCombination(combo,{source_window_months:12,verification_only_opt_in:true},third.id,{...deps,fetch:async()=>({...fixtureSource(),text:text+" Changed evidence."})});
    const unchanged = (await pool.query("SELECT * FROM future_of_work_content WHERE id=$1",[original.id])).rows[0];
    assert.equal(unchanged.last_verified_at.toISOString(),refreshed.last_verified_at.toISOString());
    assert.equal(unchanged.status,"unpublished","changed evidence auto-publishes through versioned lifecycle");
    assert.equal(Number((await pool.query("SELECT count(*) FROM future_of_work_content WHERE function_id=$1 AND status='published'",[fn.id])).rows[0].count),1);
    assert.equal(Number((await pool.query("SELECT count(*) FROM future_of_work_content WHERE function_id=$1 AND status='pending_review'",[fn.id])).rows[0].count),0);
  } finally {
    await pool.query("DELETE FROM future_work_decisions WHERE version_id IN (SELECT id FROM future_of_work_content WHERE function_id=$1)",[fn.id]);
    await pool.query("DELETE FROM future_of_work_content WHERE function_id=$1",[fn.id]);
    await pool.query("DELETE FROM future_work_functions WHERE id=$1",[fn.id]);
    await pool.query("DELETE FROM future_work_evidence WHERE run_id=ANY($1::uuid[])",[runIds]);
    await pool.query("DELETE FROM research_log WHERE id=ANY($1::uuid[])",[runIds]);
  }
});
test("publication gates reject forged/undated evidence; concise admin edits remain valid drafts",()=>{
  const evidence = sourceEvidence(fixtureSource(),12);
  assert.equal(validResearchEvidence(evidence),true);
  for (const tamper of [
    {publisher:"Unverified publisher"}, {url:"https://mckinsey.com.attacker.example/a"},
    {publishedAt:null}, {fetchedAt:null}, {contentHash:"verified"},
    {verification:{...evidence.verification,publisherIdentity:"attacker.example"}},
    {verification:{...evidence.verification,excerptHash:"0".repeat(64)}},
  ]) assert.equal(validResearchEvidence({...evidence,...tamper}),false);
  const program = {classification:"accept",relevant:true,organization:"Fixture",programName:"AI for Finance Leaders",sources:[evidence]};
  assert.equal(eligiblePublishedProgram(program),true);
  for (const tamper of [{classification:"uncertain"},{classification:"reject"},{relevant:false},{sources:[]}]) {
    assert.equal(eligiblePublishedProgram({...program,...tamper}),false);
  }
  const edit = futureWorkReviewInput.parse({action:"edit",revision:1,changes:{
    title:"Human edit",summary:"A human-reviewed synthetic summary for the regression test.",skills:["AI","X"],
  }});
  assert.equal(edit.action,"edit");
  assert.throws(()=>futureWorkReviewInput.parse({action:"edit",revision:1,changes:{sources:[evidence]}}));
});
test("canonical slots, edit lineage, defensive program privacy and deduplicated stale queue",async()=>{
  const fn = (await pool.query("INSERT INTO future_work_functions(slug,name,enabled,sort_order) VALUES($1,'Synthetic queue fixture',true,9999) RETURNING *",[`test-fw-${randomUUID()}`])).rows[0];
  const schedule = (await pool.query("SELECT * FROM future_work_schedules WHERE id='2030'")).rows[0];
  const runIds:string[]=[];
  const source = fixtureSource(`https://mit.edu/test-${fn.id}`);
  const evidence = sourceEvidence(source,12);
  const proposal = {title:"Queue fixture",summary:"This is a synthetic test of queue behavior.",skills:["Fixture skill"],
    organization:"",programName:"",description:"",classification:"uncertain" as const,rationale:"Test fixture",relevant:true,supportingQuotes:[text.slice(0,90)]};
  try {
    const row = (await pool.query(`INSERT INTO future_of_work_content(function_id,horizon,lens,slot,status,data,approved_at,last_verified_at)
      VALUES($1,2030,'technology','arbitrary-untrusted-slot','published',$2,now(),now()-interval '100 days') RETURNING *`,[fn.id,{...proposal,sources:[evidence]}])).rows[0];
    assert.equal(row.slot,`${fn.id}:content:2030:technology`);
    await assert.rejects(pool.query(`INSERT INTO future_of_work_content(function_id,horizon,lens,slot,status)
      VALUES($1,2030,'technology','different-arbitrary-slot','published')`,[fn.id]),/duplicate key/);
    for (const [classification,relevant] of [["uncertain",true],["reject",true],["accept",false]] as const) {
      await pool.query(`INSERT INTO leading_programs(function_id,slot,status,data) VALUES($1,$2,'published',$3)`,[fn.id,
        `${fn.id}:programs:2030:technology:${classification}:${relevant}`,{organization:"Test",programName:"Not publicly eligible",classification,relevant,sources:[evidence]}]);
    }
    assert.equal((await readPortal()).programs.some((v:any)=>v.functionId===fn.id),false);
    await refreshStale(); await refreshStale();
    let queue = (await pool.query("SELECT * FROM future_work_research_queue WHERE version_id=$1",[row.id])).rows;
    assert.equal(queue.length,1); assert.equal(queue[0].status,"queued");
    const run = await claimResearchRun("2030",1,"fixture-test");
    runIds.push(run.id);
    assert.equal(run.plan[0].functionId,fn.id,"stale combination must outrank rotating generic discovery");
    assert.ok(run.plan[0].queueIds.includes(queue[0].id));
    const empty = await processCombination(run.plan[0],schedule,run.id,{
      search:async()=>[],fetch:async()=>source,summarize:async()=>proposal,
    });
    assert.equal(empty.outcome,"nothing_found");
    assert.equal(empty.attempts.length,2);
    queue=(await pool.query("SELECT * FROM future_work_research_queue WHERE version_id=$1",[row.id])).rows;
    assert.equal(queue[0].status,"retry_wait");
    assert.ok(queue[0].next_attempt_at>new Date());
    await pool.query("UPDATE research_log SET status='completed' WHERE id=$1",[run.id]);
    await pool.query("UPDATE future_work_research_queue SET next_attempt_at=now() WHERE id=$1",[queue[0].id]);
    const second = await claimResearchRun("2030",1,"fixture-test");runIds.push(second.id);
    await processCombination(second.plan[0],schedule,second.id,{
      search:async()=>[source.url],fetch:async()=>({...source,text:source.text+" Changed source."}),summarize:async()=>proposal,
    });
    const pendingQueue=(await pool.query("SELECT * FROM future_work_research_queue WHERE version_id=$1",[row.id])).rows[0];
    assert.equal(pendingQueue.status,"resolved"); assert.ok(pendingQueue.candidate_version_id);
    const candidate=(await pool.query("SELECT * FROM future_of_work_content WHERE id=$1",[pendingQueue.candidate_version_id])).rows[0];
    const edited=await reviewVersion("content",candidate.id,{action:"edit",revision:candidate.revision,changes:{summary:"Short human draft."}},"fixture-editor");
    assert.equal(edited.previousVersionId,candidate.id);
    assert.equal((await pool.query("SELECT action FROM future_work_decisions WHERE version_id=$1",[edited.id])).rows[0].action,"created_by_edit");
    assert.ok((await pool.query("SELECT updated_at FROM future_of_work_content WHERE id=$1",[candidate.id])).rows[0].updated_at>=candidate.updated_at);
    await refreshStale();
    assert.equal((await pool.query("SELECT count(*) FROM future_work_research_queue WHERE version_id=$1",[row.id])).rows[0].count,"1");
    const blocked=await processCombination(second.plan[0],schedule,second.id,{
      search:async()=>[],fetch:async()=>source,summarize:async()=>proposal,
    });
    assert.equal(blocked.outcome,"nothing_found","pending drafts do not block explicit new research");
    const refreshedQueue=(await pool.query("SELECT * FROM future_work_research_queue WHERE version_id=$1",[row.id])).rows[0];
    assert.equal(refreshedQueue.candidate_version_id,candidate.id);
  } finally {
    await pool.query("DELETE FROM future_work_decisions WHERE version_id IN (SELECT id FROM future_of_work_content WHERE function_id=$1)",[fn.id]);
    for (const table of Object.values(tables)) await pool.query(`DELETE FROM ${table} WHERE function_id=$1`,[fn.id]);
    await pool.query("DELETE FROM future_work_functions WHERE id=$1",[fn.id]);
    await pool.query("DELETE FROM future_work_evidence WHERE run_id=ANY($1::uuid[])",[runIds]);
    await pool.query("DELETE FROM research_log WHERE id=ANY($1::uuid[])",[runIds]);
    await pool.query("UPDATE future_work_schedules SET cursor=$2 WHERE id='2030' AND revision=$1",[schedule.revision,schedule.cursor]);
  }
});