import assert from "node:assert/strict";
import test from "node:test";
import { modernEventDataSchema, modernEventDraftDataSchema } from "@workspace/db/schema";
import { isUsableEventSourceImage, postProcessEventDraft } from "./editorialEvent";
import { assertEditorialScreenshotBudget, EditorialScreenshotInputError, MAX_EDITORIAL_SCREENSHOT_BYTES, selectTextEvidencedYouTubeId, editorialCoverImageRequestSchema, editorialGenerateRequestSchema, editorialScreenshotUrls } from "./editorialGenerationSchema";

const source = {
  url: "https://www.linkedin.com/events/example-123/",
  canonical: "https://attacker.example/not-the-source",
  title: "Example event",
  description: "",
  image: "https://media.licdn.com/event-image.jpg",
  text: "",
};

test("Gmail or pasted text can evidence a literal YouTube watch or share URL", () => {
  const id = "dQw4w9WgXcQ";
  for (const text of [
    `Watch https://www.youtube.com/watch?v=${id}&feature=share now`,
    `Video: (https://youtu.be/${id}?t=25).`,
    `https://youtube.com/watch?v=${id}`,
    `https://m.youtube.com/watch?v=${id}`,
  ]) {
    assert.equal(selectTextEvidencedYouTubeId(text), id);
    assert.equal(selectTextEvidencedYouTubeId(text, "abcdefghijk"), id);
  }
});

test("text video selection rejects invented IDs and deceptive or ambiguous links", () => {
  for (const text of [
    "The video ID is dQw4w9WgXcQ",
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "https://youtube.com@evil.test/watch?v=dQw4w9WgXcQ",
    "https://evil.test/?url=https://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=not-valid",
    "https://youtu.be/dQw4w9WgXcQ/extra",
    "https://youtube.com/not-watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ https://youtu.be/abcdefghijk",
  ]) assert.equal(selectTextEvidencedYouTubeId(text), null);
  assert.equal(selectTextEvidencedYouTubeId(undefined, "dQw4w9WgXcQ"), null);
  assert.equal(selectTextEvidencedYouTubeId("https://youtu.be/dQw4w9WgXcQ https://youtu.be/abcdefghijk", "abcdefghijk"), "abcdefghijk");
});

test("screenshots have an aggregate binary budget leaving room below the upstream limit", () => {
  assert.doesNotThrow(() => assertEditorialScreenshotBudget([]));
  assert.doesNotThrow(() => assertEditorialScreenshotBudget([MAX_EDITORIAL_SCREENSHOT_BYTES]));
  assert.doesNotThrow(() => assertEditorialScreenshotBudget([10, MAX_EDITORIAL_SCREENSHOT_BYTES - 10]));
  assert.throws(() => assertEditorialScreenshotBudget([MAX_EDITORIAL_SCREENSHOT_BYTES, 1]), EditorialScreenshotInputError);
  assert.throws(() => assertEditorialScreenshotBudget([10, 10, 10, 10].map(mb => mb * 1024 * 1024)), /Remove some images/);
});

test("modern events require offset datetimes and an IANA timezone", () => {
  const event = {
    startAt: "2026-04-01T09:00:00+04:00",
    timezone: "Asia/Dubai",
    location: "Dubai, United Arab Emirates",
    format: "in-person",
    desc: "An evidenced event description.",
    sourceUrl: source.url,
    images: [],
  };
  assert.equal(modernEventDataSchema.safeParse(event).success, true);
  assert.equal(modernEventDataSchema.safeParse({ ...event, startAt: "2026-04-01T09:00:00" }).success, false);
  assert.equal(modernEventDataSchema.safeParse({ ...event, timezone: "Dubai" }).success, false);
  assert.equal(modernEventDataSchema.safeParse({
    ...event,
    endAt: "2026-04-01T08:00:00+04:00",
  }).success, false);
  assert.equal(modernEventDraftDataSchema.safeParse({ sourceUrl: source.url, images: [] }).success, true);
  assert.equal(modernEventDraftDataSchema.safeParse({
    sourceUrl: source.url,
    images: [],
    year: "2021",
    date: "12 October",
    stats: [],
  }).success, false);
});

test("event autofill accepts an uploaded screenshot without requiring a URL or guidance", () => {
  const parsed = editorialGenerateRequestSchema.safeParse({
    collection: "events",
    screenshotUrl: "/api/storage/evidence/drive/abcDEF123456",
    currentDraft: { title: "", slug: "", data: { images: [] } },
  });
  assert.equal(parsed.success, true);
  assert.equal(editorialGenerateRequestSchema.safeParse({
    collection: "events",
    screenshotUrl: "https://attacker.example/not-an-upload",
  }).success, false);
});

test("pasted text is accepted for every collection without a mandatory URL", () => {
  const pasted = editorialGenerateRequestSchema.safeParse({
    collection: "newsletters",
    sourceUrl: "https://www.linkedin.com/pulse/example-article/",
    sourceText: "  Evidenced newsletter text.  ",
  });
  assert.equal(pasted.success, true);
  if (pasted.success) assert.equal(pasted.data.sourceText, "Evidenced newsletter text.");
  for (const collection of ["newsletters", "masterclasses", "future-work", "events", "talks", "contributors", "communities"]) {
    assert.equal(editorialGenerateRequestSchema.safeParse({
      collection,
      sourceText: "Source text without a reference URL",
    }).success, true);
  }
  assert.equal(editorialGenerateRequestSchema.safeParse({
    collection: "newsletters",
    sourceUrl: "https://example.com/article",
    sourceText: "x".repeat(60_001),
  }).success, false);
});

test("all collections accept up to eight trusted private screenshots", () => {
  const screenshotUrls = Array.from({ length: 8 }, (_, i) => `/api/storage/evidence/drive/evidence000${i}`);
  for (const collection of ["newsletters", "masterclasses", "future-work", "events", "talks", "contributors", "communities"]) {
    assert.equal(editorialGenerateRequestSchema.safeParse({ collection, screenshotUrls }).success, true);
  }
  assert.equal(editorialGenerateRequestSchema.safeParse({
    collection: "newsletters", screenshotUrls: [...screenshotUrls, "/api/storage/evidence/drive/evidence0008"],
  }).success, false);
  assert.equal(editorialGenerateRequestSchema.safeParse({
    collection: "newsletters", screenshotUrls, screenshotUrl: "/api/storage/evidence/drive/evidence0008",
  }).success, false);
  assert.deepEqual(editorialScreenshotUrls({ screenshotUrls, screenshotUrl: screenshotUrls[0] }), screenshotUrls);
  for (const badUrl of ["https://example.com/photo.png", "/api/storage/drive/evidence0000", "/api/storage/generated/evidence0000", "/api/storage/evidence/drive/../../private"]) {
    assert.equal(editorialGenerateRequestSchema.safeParse({ collection: "events", screenshotUrls: [badUrl] }).success, false);
  }
});

test("empty evidence is rejected and each supported evidence type works alone", () => {
  for (const input of [{}, { guidance: "   " }, { screenshotUrls: [] }, { sourceText: "" }]) {
    assert.equal(editorialGenerateRequestSchema.safeParse({ collection: "talks", ...input }).success, false);
  }
  for (const input of [
    { guidance: "An editor-supplied description" },
    { sourceText: "Pasted source evidence" },
    { sourceUrl: "https://example.com/content" },
    { screenshotUrls: ["/api/storage/evidence/drive/evidence0000"] },
    { screenshotUrl: "/api/storage/evidence/drive/evidence0000" },
  ]) {
    assert.equal(editorialGenerateRequestSchema.safeParse({ collection: "talks", ...input }).success, true);
  }
});

test("generic cover generation requires only a collection and title and refuses extra instructions fields", () => {
  for (const collection of ["newsletters", "masterclasses", "future-work", "events", "talks", "contributors", "communities"]) {
    assert.equal(editorialCoverImageRequestSchema.safeParse({ collection, title: "Representative artwork" }).success, true);
  }
  assert.equal(editorialCoverImageRequestSchema.safeParse({ collection: "talks", title: " " }).success, false);
  assert.equal(editorialCoverImageRequestSchema.safeParse({ collection: "other", title: "Artwork" }).success, false);
  assert.equal(editorialCoverImageRequestSchema.safeParse({ collection: "talks", title: "Artwork", screenshotUrl: "/private" }).success, false);
});

test("event post-processing pins its source URL and retains its evidenced image", () => {
  const data: Record<string, unknown> = {
    startAt: "2026-04-01T09:00:00+04:00",
    timezone: "Asia/Dubai",
    location: "Dubai",
    format: "in-person",
    desc: "Example event",
    sourceUrl: "https://attacker.example/not-the-source",
    images: ["https://example.com/existing.jpg"],
  };
  const warnings: string[] = [];
  postProcessEventDraft({ data, source, warnings });
  assert.equal(data.sourceUrl, source.url);
  assert.deepEqual(data.images, [source.image, "https://example.com/existing.jpg"]);
  assert.deepEqual(warnings, []);
});

test("event post-processing gives actionable warnings instead of fabricating facts", () => {
  const data: Record<string, unknown> = { images: [] };
  const warnings: string[] = [];
  postProcessEventDraft({ data, warnings });
  assert.equal(data.startAt, undefined);
  assert.equal(data.location, undefined);
  assert.equal(data.images instanceof Array && data.images.length, 0);
  assert.match(warnings.join("\n"), /start date and time/);
  assert.match(warnings.join("\n"), /location/);
  assert.match(warnings.join("\n"), /image/);
});

test("generic LinkedIn sign-in imagery is not treated as an event image", () => {
  assert.equal(
    isUsableEventSourceImage("https://static.licdn.com/scds/common/u/images/logos/favicons/v1/favicon.ico"),
    false,
  );
  const data: Record<string, unknown> = {};
  const warnings: string[] = [];
  postProcessEventDraft({
    data,
    warnings,
    source: {
      ...source,
      image: "https://static.licdn.com/scds/common/u/images/logos/favicons/v1/favicon.ico",
    },
  });
  assert.deepEqual(data.images, []);
  assert.match(warnings.join("\n"), /image is optional/);
});

test("generic LinkedIn imagery is removed from generated and current draft images", () => {
  const data: Record<string, unknown> = {
    images: [
      "https://static.licdn.com/aero-v1/sc/h/1234-login-logo.svg",
      "https://www.linkedin.com/favicon.ico",
      "https://media.licdn.com/dms/image/event-real-image.jpg",
    ],
  };
  const warnings: string[] = [];
  postProcessEventDraft({ data, warnings, source: { ...source, image: "" } });
  assert.deepEqual(data.images, ["https://media.licdn.com/dms/image/event-real-image.jpg"]);
  assert.doesNotMatch(warnings.join("\n"), /image is optional/);
});