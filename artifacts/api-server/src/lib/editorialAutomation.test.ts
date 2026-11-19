import test from "node:test";
import assert from "node:assert/strict";
import {
  automationRuleInput, automationRulePatch, automationSearchQuery, nextAutomationRun,
  sanitizeAutomationData, senderAddress, withAutomationTimeout,
} from "./editorialAutomationPolicy";
import { extractAutomationBody } from "./editorialAutomationGmail";

const routerStack = (router: unknown) => (router as { stack: any[] }).stack;

test("all editorial collections accept draft-only daily rules by default", () => {
  for (const collection of ["newsletters", "masterclasses", "future-work", "events", "talks", "contributors", "communities"]) {
    const rule = automationRuleInput.parse({ name: "Editorial source", collection, senders: ["Editorial@example.com"] });
    assert.equal(rule.publishMode, "draft");
    assert.equal(rule.enabled, false);
    assert.deepEqual(rule.senders, ["editorial@example.com"]);
    assert.equal(rule.maxItems, 10);
  }
});

test("queries require exact senders and bounded lookback/item limits", () => {
  const input = { name: "Rule", collection: "newsletters", senders: ["a@example.com"] };
  for (const patch of [{ senders: [] }, { senders: ["*"] }, { maxItems: 21 }, { lookbackDays: 31 }, { scheduleUtc: "24:00" }, { enabled: "yes" }]) {
    assert.equal(automationRuleInput.safeParse({ ...input, ...patch }).success, false);
  }
  assert.match(automationSearchQuery({ senders: ["a@example.com", "b@example.com"], lookbackDays: 7, search: "subject:Research" }),
    /^\(from:a@example.com OR from:b@example.com\) newer_than:7d -in:trash -in:spam \(subject:Research\)$/);
});

test("patches do not silently overwrite omitted configuration", () => {
  assert.deepEqual(automationRulePatch.parse({ enabled: false }), { enabled: false });
  assert.equal(automationRulePatch.safeParse({ mailboxEmail: "someone@example.com" }).success, false);
});

test("next run is a strictly future UTC instant including midnight", () => {
  assert.equal(nextAutomationRun("02:00", new Date("2026-09-18T01:59:00Z")).toISOString(), "2026-09-18T02:00:00.000Z");
  assert.equal(nextAutomationRun("02:00", new Date("2026-09-18T02:00:00Z")).toISOString(), "2026-09-19T02:00:00.000Z");
  assert.equal(nextAutomationRun("00:00", new Date("2026-12-31T23:59:00Z")).toISOString(), "2027-01-01T00:00:00.000Z");
});

test("sender extraction does not confuse display names with the address", () => {
  assert.equal(senderAddress("Approved Sender <EDITOR@example.com>"), "editor@example.com");
  assert.notEqual(senderAddress("editor@example.com <attacker@example.com>"), "editor@example.com");
});

test("private mail links, all photos, evidence paths and unknown payloads cannot become public", () => {
  const result = sanitizeAutomationData({
    excerpt: "Read /api/storage/evidence/drive/private-image or https://mail.google.com/mail/u/0/#inbox/id contact private@example.com",
    image: "https://example.com/cover.jpg", thumbnail: "https://example.com/thumb.jpg",
    coverImage: "/api/storage/evidence/drive/private-image",
    author: { name: "Real Byline", image: "/private.jpg", privateEmail: "private@example.com" },
    url: "https://mail.google.com/mail/u/0/#inbox/id",
    sourceUrl: "https://example.com/article", body: "RAW PRIVATE EMAIL",
    attachments: [{ title: "secret attachment" }], customField: "private",
  });
  assert.deepEqual(result.author, { name: "Real Byline" });
  for (const key of ["image", "thumbnail", "coverImage", "url", "body", "attachments", "customField"]) assert.equal(key in result, false);
  assert.equal(result.sourceUrl, undefined);
  assert.doesNotMatch(String(result.excerpt), /evidence|mail\.google|private@example/);
});

test("automatic publishing cannot retain email click wrappers or subscriber identifiers", () => {
  for (const link of [
    "https://click.example.com/ls/click?upn=opaqueSubscriber",
    "https://example.com/article?recipient=private%40example.com",
    "https://example.com/article?mc_eid=secretSubscriber",
    "https://example.com/click/opaqueSubscriber",
    "https://example.com/article#subscriber-secret",
    "https%3A%2F%2Fexample.com%2Fclick%3Femail%3Dprivate%2540example.com",
    "//click.example.com/opaqueSubscriber",
  ]) {
    const result = sanitizeAutomationData({
      url: link, sourceUrl: link, registrationUrl: link,
      excerpt: `Read ${link} today`,
      contributions: [{ title: "Article", url: link, description: `See ${link}` }],
    });
    assert.deepEqual(result, {
      excerpt: "Read  today", contributions: [{ title: "Article", description: "See " }],
    });
  }
});

test("MIME extraction ignores binary attachments and script content", () => {
  const encode = (text: string) => Buffer.from(text).toString("base64url");
  const text = extractAutomationBody({ parts: [
    { mimeType: "image/png", body: { data: encode("PRIVATE IMAGE BYTES") } },
    { mimeType: "text/html", body: { data: encode('<script>secret()</script><p>Real text</p><a href="https://example.com/article">Article</a>') } },
  ] });
  assert.match(text, /Real text/);
  assert.match(text, /https:\/\/example.com\/article/);
  assert.doesNotMatch(text, /PRIVATE IMAGE|secret|script/);
});

test("source text is bounded and empty attachment-only mail is not fabricated", () => {
  assert.equal(extractAutomationBody({ mimeType: "application/pdf", body: { data: "YWJj" } }), "");
  assert.equal(extractAutomationBody({ mimeType: "text/plain", body: { data: Buffer.from("a".repeat(100_000)).toString("base64url") } }).length, 60_000);
});

test("bounded operations return success and fail rather than waiting indefinitely", async () => {
  assert.equal(await withAutomationTimeout(Promise.resolve("ok"), 10), "ok");
  // Keep event loop alive while testing an intentionally unref'ed timeout.
  const keepAlive = setInterval(() => {}, 100);
  try { await assert.rejects(withAutomationTimeout(new Promise(() => {}), 5), /timed out/); }
  finally { clearInterval(keepAlive); }
});

test("automation permissions keep publishing rules admin-only and draft-only sources staff-accessible", async () => {
  process.env.NODE_ENV = "production";
  const [
    { default: automationRouter },
    { default: newsletterSourcesRouter },
    { default: linkedInNewsletterRouter },
    { requireEditorialAdmin, requireEditorialStaff },
  ] = await Promise.all([
    import("../routes/editorial-automation"),
    import("../routes/newsletter-sources"),
    import("../routes/linkedin-newsletter"),
    import("../middlewares/requireEditorialStaff"),
  ]);
  const automationStack = routerStack(automationRouter);
  const automationGuard = automationStack.findIndex(layer => layer.handle === requireEditorialAdmin);
  assert.ok(automationGuard >= 0, "publishing automation must use the administrator guard");
  for (const layer of automationStack.filter(layer => layer.route)) {
    assert.ok(
      automationStack.indexOf(layer) > automationGuard,
      `${layer.route.path} must remain behind the administrator guard`,
    );
  }

  const sourceStack = routerStack(newsletterSourcesRouter);
  const sourceGuard = sourceStack.findIndex(layer => layer.handle === requireEditorialStaff);
  assert.ok(sourceGuard >= 0, "email source management must use the editorial staff guard");
  for (const layer of sourceStack.filter(layer => layer.route)) {
    assert.ok(
      sourceStack.indexOf(layer) > sourceGuard,
      `${layer.route.path} must remain behind the staff guard`,
    );
  }

  const linkedInRoutes = routerStack(linkedInNewsletterRouter).filter(layer => layer.route);
  assert.equal(linkedInRoutes.length, 2);
  for (const layer of linkedInRoutes) {
    assert.equal(
      layer.route.stack[0]?.handle,
      requireEditorialStaff,
      `${layer.route.path} must remain behind the staff guard`,
    );
  }
});