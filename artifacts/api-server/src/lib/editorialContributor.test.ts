import assert from "node:assert/strict";
import test from "node:test";
import { selectLinkedInProfileImage } from "./editorialContributor";

test("accepts only a LinkedIn profile display photo", () => {
  assert.deepEqual(
    selectLinkedInProfileImage({
      sourceImage: "https://media.licdn.com/dms/image/v2/profile-displayphoto-shrink_800_800/example",
    }),
    {
      image: "https://media.licdn.com/dms/image/v2/profile-displayphoto-shrink_800_800/example",
      evidenced: true,
    },
  );
});

test("rejects a generic LinkedIn asset", () => {
  assert.deepEqual(
    selectLinkedInProfileImage({
      sourceImage: "https://static.licdn.com/aero-v1/sc/h/linkedin-logo.svg",
    }),
    { image: undefined, evidenced: false },
  );
});

test("does not retain an AI fallback when LinkedIn exposes no image", () => {
  assert.deepEqual(
    selectLinkedInProfileImage({}),
    { image: undefined, evidenced: false },
  );
});

test("preserves the current portrait when extraction fails", () => {
  assert.deepEqual(
    selectLinkedInProfileImage({
      sourceImage: "https://static.licdn.com/generic.png",
      currentImage: "/api/editorial-assets/current-portrait.png",
    }),
    {
      image: "/api/editorial-assets/current-portrait.png",
      evidenced: false,
    },
  );
});