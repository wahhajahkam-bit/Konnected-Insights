import assert from "node:assert/strict";
import test from "node:test";
import {
  editorialSeedItems,
  isLegacyUnauthorizedSeededProspect,
  legacyUnauthorizedProspectCutoff,
  legacyUnauthorizedProspectFingerprints,
  type LegacyProspectCandidate,
} from "./editorial-seed";

const candidate = (
  fingerprint = legacyUnauthorizedProspectFingerprints[0]!,
  overrides: Partial<LegacyProspectCandidate> = {},
): LegacyProspectCandidate => ({
  collection: "contributors",
  slug: fingerprint.slug,
  title: fingerprint.title,
  status: "published",
  sortOrder: fingerprint.sortOrder,
  data: structuredClone(fingerprint.data),
  version: 1,
  sourceId: null,
  createdAt: new Date("2026-08-29T10:48:20.870Z"),
  updatedAt: new Date("2026-08-29T10:48:20.870Z"),
  ...overrides,
});

const reseed = (items: LegacyProspectCandidate[]) => {
  const cleaned = items.filter((item) => !isLegacyUnauthorizedSeededProspect(item));
  const existing = new Set(cleaned.map((item) => `${item.collection}:${item.slug}`));
  for (const item of editorialSeedItems) {
    const key = `${item.collection}:${item.slug}`;
    if (!existing.has(key)) existing.add(key);
  }
  return cleaned;
};

test("cleanup recognizes all five exact historical seeded placeholders", () => {
  const historical = legacyUnauthorizedProspectFingerprints
    .filter((fingerprint) => fingerprint.data.group === "Network Contributors")
    .map((fingerprint) => candidate(fingerprint));

  assert.deepEqual(
    historical.filter(isLegacyUnauthorizedSeededProspect).map((item) => item.slug).sort(),
    ["abdul", "ahmed", "chandni", "kuljeet", "pranata"],
  );
});

test("cleanup is repeat-safe and reseeding does not restore removed prospects", () => {
  const initial = legacyUnauthorizedProspectFingerprints
    .filter((fingerprint) => fingerprint.data.group === "Contributors")
    .map((fingerprint) => candidate(fingerprint));

  const once = reseed(initial);
  const twice = reseed(once);

  assert.deepEqual(once, []);
  assert.deepEqual(twice, []);
  assert.equal(
    editorialSeedItems.some((item) =>
      item.collection === "contributors"
      && ["abdul", "ahmed", "chandni", "kuljeet", "pranata"].includes(item.slug)),
    false,
  );
});

test("cleanup preserves editor replacements and later explicit re-additions", () => {
  const fingerprint = legacyUnauthorizedProspectFingerprints.find(
    (item) => item.slug === "kuljeet" && item.data.group === "Contributors",
  )!;
  const editorReplacement = candidate(fingerprint, {
    version: 4,
    sortOrder: 0,
    data: { ...fingerprint.data, linkedinUrl: "https://www.linkedin.com/in/kuljeetchahal/" },
    updatedAt: new Date("2026-08-31T16:14:50.499Z"),
  });
  const explicitReAdd = candidate(fingerprint, {
    createdAt: new Date(legacyUnauthorizedProspectCutoff.getTime() + 1),
    updatedAt: new Date(legacyUnauthorizedProspectCutoff.getTime() + 1),
  });

  assert.equal(isLegacyUnauthorizedSeededProspect(editorReplacement), false);
  assert.equal(isLegacyUnauthorizedSeededProspect(explicitReAdd), false);
  assert.deepEqual(reseed(reseed([editorReplacement, explicitReAdd])), [
    editorReplacement,
    explicitReAdd,
  ]);
});