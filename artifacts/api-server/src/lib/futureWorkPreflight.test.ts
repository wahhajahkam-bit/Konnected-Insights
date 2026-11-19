import { test } from "node:test";
import assert from "node:assert/strict";
import { preflightResearchSource } from "./futureWorkPreflight";
import { UnsupportedEditorialFormat, type EditorialSource } from "./editorialSource";

const url = "https://www.oecd.org/";
const windows = [{ id: "2030", sourceWindowMonths: 24 }];
const page: EditorialSource = {
  url, title: "Research report", text: "Evidence text. ".repeat(100),
  description: "", date: new Date(Date.now() - 86400000).toISOString(), contentType: "text/html",
};
test("reports supported dated evidence without claiming claim approval", async () => {
  const result = await preflightResearchSource(url, windows, async () => page);
  assert.equal(result.evidence[0].eligible, true);
  assert.equal(result.retrieval, "retrieved");
  assert.equal(result.format, "text/html");
  assert.equal(result.publicationDate, page.date);
  assert.match(result.disclaimer, /not claim approval/);
});
test("uses evidence policy for missing dates, stale dates, access walls and insufficient content", async () => {
  for (const patch of [{ date: "" }, { date: "2000-01-01" }, { title: "Access denied" }, { text: "Short" }]) {
    const result = await preflightResearchSource(url, windows, async () => ({ ...page, ...patch }));
    assert.equal(result.retrieval, "retrieved");
    assert.equal(result.evidence[0].eligible, false);
  }
});
test("redirects do not grant publisher eligibility or broaden source restrictions", async () => {
  const result = await preflightResearchSource(url, windows, async () => ({ ...page, url: "https://unknown.example/report" }));
  assert.equal(result.publisher, "oecd.org");
  assert.equal(result.finalPublisher, null);
  assert.equal(result.withinSavedSource, false);
  assert.equal(result.evidence[0].eligible, false);
});
test("unsupported PDF is distinguished from unsafe or failed retrieval", async () => {
  const pdf = await preflightResearchSource(url, windows, async () => { throw new UnsupportedEditorialFormat(url, "application/pdf"); });
  assert.equal(pdf.retrieval, "unsupported");
  assert.equal(pdf.format, "application/pdf");
  assert.equal(pdf.publicationDate, null);
  const failed = await preflightResearchSource(url, windows, async () => { throw new Error("private address 10.0.0.1"); });
  assert.equal(failed.retrieval, "failed");
  assert.equal(failed.format, null);
  assert.doesNotMatch(failed.message, /10\.0\.0\.1/);
});