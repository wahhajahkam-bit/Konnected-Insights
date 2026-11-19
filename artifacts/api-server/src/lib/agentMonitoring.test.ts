import { test } from "node:test";
import assert from "node:assert/strict";
import { manualSession, monitoringFilters, effectiveStatus, safeCode, safeOutputPath } from "./agentMonitoringPolicy";

test("manual sessions validate duration, dates, paired cost and reject server identity", () => {
  const base = { label: "Session", startedAt: "2026-01-01T00:00:00Z", durationMs: 100 };
  assert.equal(manualSession.safeParse(base).success, true);
  for (const value of [
    { ...base, durationMs: -1 }, { ...base, finishedAt: "2026-01-02T00:00:00Z" },
    { ...base, costAmount: 2 }, { ...base, currency: "USD" }, { ...base, enteredBy: "other" },
    { ...base, status: "running" }, { label: "x", startedAt: base.startedAt, finishedAt: "2025-01-01T00:00:00Z" },
    { label: "x", startedAt: base.startedAt, finishedAt: "2027-01-02T00:00:00Z" },
  ]) assert.equal(manualSession.safeParse(value).success, false);
  assert.equal(manualSession.safeParse({ ...base, costAmount: 0, currency: "USD" }).success, true);
});
test("filters use bounded pagination and exact allowlists", () => {
  assert.deepEqual(monitoringFilters.parse({}), { page: 1, pageSize: 25 });
  for (const query of [{ page: "0" }, { pageSize: 101 }, { agentId: "injected" }, { status: "other" }, { category: "other" }, { from: "2026-02-01T00:00:00Z", to: "2026-01-01T00:00:00Z" }]) {
    assert.equal(monitoringFilters.safeParse(query).success, false);
  }
});
test("interrupted display survives restarts and never rewrites worker status", () => {
  const row = { status: "running", heartbeat_at: new Date(0) };
  assert.equal(effectiveStatus(row, 31 * 60000), "interrupted");
  assert.equal(effectiveStatus(row, 20 * 60000), "running");
  assert.equal(row.status, "running");
});
test("telemetry cannot store arbitrary provider errors or unsafe links", () => {
  assert.equal(safeCode("Bearer secret-token"), null);
  assert.equal(safeCode("error user@example.com"), null);
  assert.equal(safeCode("https://private.example/key"), null);
  assert.equal(safeOutputPath("https://external.example"), null);
  assert.equal(safeOutputPath("/admin?newsletterId=11111111-1111-1111-1111-111111111111"), "/admin?newsletterId=11111111-1111-1111-1111-111111111111");
});