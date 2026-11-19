import test from "node:test";
import assert from "node:assert/strict";
import { evidencePassages, selectedPassages, enforceSupportReview, supportReviewSchema } from "./futureWorkGrounding";

test("passage selections preserve exact Unicode evidence without generated quote delimiters", () => {
  const excerpt = ("Finance’s AI tools support forecasting—under human oversight. " +
    "CFOs evaluate controls and model risk before using predictions. ").repeat(30);
  const passages = evidencePassages(excerpt);
  assert.ok(passages.length > 4);
  assert.ok(passages.every(p => p.text.length <= 600 && excerpt.includes(p.text)));
  assert.deepEqual(selectedPassages(passages, ["P2"]).map(p => p.text), [passages[1].text]);
  assert.throws(() => selectedPassages(passages, ["P999"]), /Unknown/);
  assert.throws(() => selectedPassages(passages, ["P1", "P1"]), /Invalid/);
});

test("arbitrary real passage does not bypass per-claim support review", () => {
  const passages = [{ id: "P1", text: "Subscribe to our finance newsletter for the latest insights." }];
  const review = supportReviewSchema.parse({
    relevant: true, horizonAppropriate: true, rationale: "A substantive review must cover every claim.",
    claims: [{ id: "title", supported: false, passageIds: ["P1"], reason: "Subscription boilerplate does not support an automation forecast." }],
  });
  assert.throws(() => enforceSupportReview(review, ["title"], passages), /does not support/);
  assert.throws(() => enforceSupportReview({ ...review, claims: [] }, ["title"], passages), /omitted/);
  assert.throws(() => enforceSupportReview({ ...review, claims: [{ ...review.claims[0], supported: true, passageIds: ["P9"] }] }, ["title"], passages), /does not support/);
  assert.throws(() => enforceSupportReview({ ...review, horizonAppropriate: false }, ["title"], passages), /horizon/);
  assert.doesNotThrow(() => enforceSupportReview({ ...review, claims: [{ ...review.claims[0], supported: true }] }, ["title"], passages));
});