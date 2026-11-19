import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicIpAddress,
  normalizeEditorialSlug,
  normalizeLinkedInArticleUrl,
  normalizeYouTubeVideoId,
  parsePublicSourceUrl,
  validatePublicSourceUrl,
} from "./editorialUrlSafety";
import { pinnedRequestOptions } from "./editorialSource";
import { isLinkedInAuthenticationWall } from "./editorialSource";
import { hasDuplicateLinkedInNewsletterUrl } from "./editorialNewsletter";

test("rejects local and non-public source URLs", () => {
  for (const value of [
    "http://localhost/page",
    "http://127.0.0.1/page",
    "http://10.2.3.4/page",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/page",
    "https://user:password@example.com/page",
    "https://example.com:8443/page",
    "file:///etc/passwd",
  ]) {
    assert.throws(() => parsePublicSourceUrl(value));
  }
});

test("accepts ordinary public HTTP URLs and addresses", () => {
  assert.equal(parsePublicSourceUrl("https://example.com/article").hostname, "example.com");
  assert.equal(isPublicIpAddress("8.8.8.8"), true);
  assert.equal(isPublicIpAddress("2606:4700:4700::1111"), true);
});

test("pins the validated address rather than resolving a source hostname again", async () => {
  let resolutions = 0;
  const target = await validatePublicSourceUrl("https://example.com/article", async () => {
    resolutions++;
    return [{ address: "8.8.8.8", family: 4 }];
  });
  // A rebinding resolver would return a private address on a second lookup.
  const rebindingResolver = async () => {
    resolutions++;
    return [{ address: "127.0.0.1", family: 4 }];
  };
  const options = pinnedRequestOptions(target);

  assert.equal(options.hostname, "8.8.8.8");
  assert.equal(
    (options as typeof options & { servername?: string }).servername,
    "example.com",
  );
  assert.equal((options.headers as Record<string, string>).host, "example.com");
  assert.equal(resolutions, 1);
  assert.equal((await rebindingResolver())[0]!.address, "127.0.0.1");
  const pinnedLookup = options.lookup as (
    hostname: string,
    options: unknown,
    callback: (error: Error | null, address: string, family: number) => void,
  ) => void;
  const connectedAddress = await new Promise<string>((resolve, reject) => {
    pinnedLookup("example.com", {}, (error, address) => error ? reject(error) : resolve(address));
  });
  assert.equal(connectedAddress, "8.8.8.8");
  // The connection target remains the previously validated public address.
  assert.equal(options.hostname, target.address);
});

test("classifies private, reserved, link-local, and multicast addresses", () => {
  for (const address of [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1",
    "172.16.0.1", "192.168.1.1", "192.0.2.1", "198.18.0.1",
    "224.0.0.1", "::", "::1", "fe80::1", "fc00::1", "ff02::1", "2001:db8::1",
  ]) {
    assert.equal(isPublicIpAddress(address), false, address);
  }
});

test("normalizes editorial slugs", () => {
  assert.equal(normalizeEditorialSlug("  Héllo & Future—Work!  "), "hello-and-future-work");
  assert.equal(normalizeEditorialSlug("***"), "untitled");
});

test("normalizes supported YouTube URLs without guessing IDs", () => {
  assert.equal(normalizeYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=4"), "dQw4w9WgXcQ");
  assert.equal(normalizeYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(normalizeYouTubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(normalizeYouTubeVideoId("not a video"), null);
});

test("normalizes LinkedIn article URLs for duplicate checks", () => {
  assert.equal(
    normalizeLinkedInArticleUrl("https://www.linkedin.com/pulse/example-story/?trk=email#section"),
    "https://linkedin.com/pulse/example-story",
  );
  assert.equal(
    normalizeLinkedInArticleUrl("http://linkedin.com/pulse/example-story"),
    "https://linkedin.com/pulse/example-story",
  );
  assert.equal(normalizeLinkedInArticleUrl("https://linkedin.com/company/example"), null);
  assert.equal(hasDuplicateLinkedInNewsletterUrl(
    { sourceUrl: "https://linkedin.com/pulse/example-story?utm_source=test" },
    [{
      id: "existing",
      data: { url: "https://www.linkedin.com/pulse/example-story/" },
    }],
  ), true);
  assert.equal(hasDuplicateLinkedInNewsletterUrl(
    { url: "https://linkedin.com/pulse/example-story" },
    [{
      id: "existing",
      data: { sourceUrl: "https://www.linkedin.com/pulse/example-story/" },
    }],
    "existing",
  ), false);
});

test("recognizes a LinkedIn authentication wall without rejecting article content", () => {
  assert.equal(isLinkedInAuthenticationWall({
    url: "https://www.linkedin.com/pulse/example",
    title: "Sign in to LinkedIn",
    description: "New to LinkedIn? Join now",
    text: "",
  }), true);
  assert.equal(isLinkedInAuthenticationWall({
    url: "https://www.linkedin.com/pulse/example",
    title: "An evidenced article",
    description: "A newsletter description",
    text: "Article body",
  }), false);
});