import assert from "node:assert/strict";
import test from "node:test";

import * as ingestion from "./gmailNewsletterParsing";

test("matcher requires exact sender before case-insensitive any-keyword subject matching", () => {
  const source = {
    senderEmail: "newsletter@example.com",
    subjectKeywords: ["Edition", "Weekly letter"],
  };
  assert.equal(ingestion.matchesConfiguredMessage(source as never, {
    sender: "Publisher <newsletter@example.com>",
    subject: "The WEEKLY LETTER: June",
  }), true);
  assert.equal(ingestion.matchesConfiguredMessage(source as never, {
    sender: "newsletter+other@example.com",
    subject: "Weekly letter",
  }), false);
  assert.equal(ingestion.matchesConfiguredMessage(source as never, {
    sender: "newsletter@example.com",
    subject: "Unrelated campaign",
  }), false);
});

test("parser extracts nested base64url text and evidenced hrefs", () => {
  const html = '<p>An evidenced summary</p><a href="https://news.example/article?utm_source=email">Read</a>';
  const parsed = ingestion.parseFullGmailMessage({
    payload: {
      mimeType: "multipart/alternative",
      parts: [{
        mimeType: "text/html",
        body: { data: Buffer.from(html).toString("base64url") },
      }],
    },
  });
  assert.match(parsed.text, /An evidenced summary/);
  assert.deepEqual(parsed.urls, ["https://news.example/article?utm_source=email"]);
});

test("article selection rejects unsubscribe/security links and prioritizes reference evidence", () => {
  const urls = [
    "https://news.example/unsubscribe?id=1",
    "https://other.example/story",
    "https://news.example/edition/42?utm_source=email",
  ];
  assert.equal(
    ingestion.chooseEvidencedArticleUrl(urls, ["https://news.example/edition/42"]),
    "https://news.example/edition/42?utm_source=email",
  );
});

test("AI extraction is rejected when exact values or links lack evidence", () => {
  const evidence = {
    subject: "Edition 42",
    snippet: "A supported summary",
    text: "Read the supported article",
    urls: ["https://news.example/article"],
  };
  assert.throws(() => ingestion.requireAiExtractionEvidence({
    title: "Fabricated title",
    excerpt: "A supported summary",
    articleUrl: "https://news.example/article",
  }, evidence), /not supported/);
  assert.throws(() => ingestion.requireAiExtractionEvidence({
    title: "Edition 42",
    excerpt: "A supported summary",
    articleUrl: "https://news.example/unsubscribe",
  }, evidence), /not supported/);
});

test("reference-only matching rejects unrelated links", () => {
  assert.equal(
    ingestion.hasEvidencedReferenceMatch(
      ["https://unrelated.example/article"],
      ["https://linkedin.com/newsletter/example"],
    ),
    false,
  );
  assert.equal(
    ingestion.hasEvidencedReferenceMatch(
      ["https://linkedin.com/newsletter/example?utm_source=email"],
      ["https://www.linkedin.com/newsletter/example"],
    ),
    true,
  );
});

test("newest sorted run wins and deadline comparison is deterministic", () => {
  const newest = { sourceId: "source", id: "new" };
  const oldest = { sourceId: "source", id: "old" };
  assert.equal(ingestion.firstRunBySource([newest, oldest]).get("source")?.id, "new");
  assert.equal(ingestion.hasRunDeadlineElapsed(1_000, 999), false);
  assert.equal(ingestion.hasRunDeadlineElapsed(1_000, 1_000), true);
});