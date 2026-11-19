import assert from "node:assert/strict";
import test from "node:test";
import { createEditorialItemSchema, editorialCollections, validateEditorialWriteData } from "@workspace/db/schema";
import { normalizeEditorialWriteData } from "./editorialWriteData";

const completeModernEvent = {
  startAt: "2026-10-01T18:30:00+04:00",
  endAt: "2026-10-01T20:00:00+04:00",
  timezone: "Asia/Dubai",
  location: "Dubai, United Arab Emirates",
  format: "in-person",
  desc: "An organizer-verified event.",
  sourceUrl: "https://www.linkedin.com/events/example-123/",
  images: [],
};

test("published events accept missing dates but validate supplied metadata", () => {
  assert.equal(validateEditorialWriteData("events", completeModernEvent).success, true);
  assert.equal(validateEditorialWriteData("events", {
    ...completeModernEvent,
    startAt: undefined,
  }, "published").success, true);
});

test("legacy event payloads remain read-compatible but cannot be written", () => {
  assert.equal(validateEditorialWriteData("events", {
    year: "2021",
    date: "12 October",
    location: "Dubai",
    desc: "Unsupported legacy event.",
    stats: [{ label: "Sessions", value: "1" }],
    images: ["/archive.jpg"],
  }).success, false);
  assert.equal(validateEditorialWriteData("events", {
    ...completeModernEvent,
    year: "2021",
    date: "12 October",
    stats: [{ label: "Sessions", value: "1" }],
  }).success, false);
});

test("an incomplete event can be saved or published without fabricating details", () => {
  const incomplete = {
    sourceUrl: "https://www.linkedin.com/events/example-123/",
    images: [],
  };
  assert.equal(validateEditorialWriteData("events", incomplete, "draft").success, true);
  assert.equal(validateEditorialWriteData("events", incomplete, "published").success, true);
});

test("every collection accepts title-only content with optional metadata absent or blank", () => {
  for (const collection of editorialCollections) {
    for (const data of [{}, { image: '', url: '', author: { name: '', image: '' } }]) {
      assert.equal(createEditorialItemSchema.safeParse({ collection, title: 'Actual source title', slug: 'source-title', status: 'published', data }).success, true, collection);
      assert.equal(validateEditorialWriteData(collection, data, 'published').success, true, collection);
    }
  }
  assert.equal(createEditorialItemSchema.safeParse({ collection: 'newsletters', title: '', slug: 'source-title' }).success, false);
});

test("supplied links, media, date, timezone and video metadata remain validated", () => {
  for (const collection of editorialCollections) {
    assert.equal(createEditorialItemSchema.safeParse({ collection, title: 'Title', slug: 'title', data: { url: 'javascript:alert(1)' } }).success, false);
    assert.equal(createEditorialItemSchema.safeParse({ collection, title: 'Title', slug: 'title', data: { image: '//unsafe.test/image' } }).success, false);
  }
  assert.equal(validateEditorialWriteData('events', { timezone: 'invented/timezone' }).success, false);
  assert.equal(validateEditorialWriteData('talks', { id: 'invalid-id' }).success, false);
  assert.equal(validateEditorialWriteData('newsletters', { url: 'not-a-url' }).success, false);
});

test("draft event writes still reject invalid supplied values and legacy fields", () => {
  assert.equal(validateEditorialWriteData("events", {
    startAt: "not-a-date",
    images: [],
  }, "draft").success, false);
  assert.equal(validateEditorialWriteData("events", {
    year: "2021",
    images: [],
  }, "draft").success, false);
});

test("draft event writes reject an end time before a supplied start time", () => {
  const result = validateEditorialWriteData("events", {
    startAt: "2026-09-12T18:00:00+04:00",
    endAt: "2026-09-12T17:00:00+04:00",
  }, "draft");
  assert.equal(result.success, false);
});

test("event normalization owns image provenance and manual completion mode", async () => {
  assert.deepEqual(await normalizeEditorialWriteData("events", {
    startAt: "2026-09-12T18:00:00+04:00",
    images: ["/api/storage/generated/abcDEF123456"],
    imageProvenance: "forged-value",
  }, async (fileId) => assert.equal(fileId, "abcDEF123456")), {
    startAt: "2026-09-12T18:00:00+04:00",
    images: ["/api/storage/generated/abcDEF123456"],
    imageProvenance: "ai-generated-representative-artwork",
    completionMode: "manual",
  });
  assert.deepEqual(await normalizeEditorialWriteData("events", {
    startAt: "2026-09-12T18:00:00+04:00",
    endAt: "2026-09-12T20:00:00+04:00",
    images: ["/api/storage/drive/abcDEF123456"],
    imageProvenance: "ai-generated-representative-artwork",
    completionMode: "manual",
  }), {
    startAt: "2026-09-12T18:00:00+04:00",
    endAt: "2026-09-12T20:00:00+04:00",
    images: ["/api/storage/drive/abcDEF123456"],
  });
});

test("event normalization rejects generated artwork that storage cannot verify", async () => {
  await assert.rejects(
    normalizeEditorialWriteData("events", {
      images: ["/api/storage/generated/abcDEF123456"],
    }, async () => {
      throw new Error("wrong purpose or missing");
    }),
    /InvalidGeneratedImageReferenceError/,
  );
});

test("all collection covers derive artwork provenance from verified storage", async () => {
  for (const [collection, field] of [
    ["newsletters", "image"], ["masterclasses", "image"], ["future-work", "img"],
    ["talks", "thumbnail"], ["contributors", "coverImage"], ["communities", "image"],
  ]) {
    const normalized = await normalizeEditorialWriteData(collection, {
      [field]: "/api/storage/generated/abcDEF123456",
    }, async (id) => assert.equal(id, "abcDEF123456"));
    assert.equal(normalized.imageProvenance, "ai-generated-representative-artwork");
    assert.equal((await normalizeEditorialWriteData(collection, {
      [field]: "/source-cover.jpg", imageProvenance: "ai-generated-representative-artwork",
    })).imageProvenance, undefined);
    await assert.rejects(normalizeEditorialWriteData(collection, {
      [field]: "/api/storage/generated/abcDEF123456",
    }), /InvalidGeneratedImageReferenceError/);
  }
});