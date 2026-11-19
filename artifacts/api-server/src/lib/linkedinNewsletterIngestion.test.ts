import test from "node:test";
import assert from "node:assert/strict";
import {
  APPROVED_LINKEDIN_SOURCE_URL,
  APPROVED_NEWSLETTER_CATEGORY,
  approvedLinkedInOrganizationName,
  buildLinkedInEditorialDraft,
  completeLinkedInNewsletterRecord,
  getNextLinkedInPageStart,
  parseLinkedInArticlePost,
} from "./linkedinNewsletterMapping";

const authorUrn = "urn:li:organization:2414183";
const officialArticlePostFixture = {
  lifecycleState: "PUBLISHED",
  visibility: "PUBLIC",
  publishedAt: 1634817394721,
  author: authorUrn,
  content: {
    article: {
      source: "https://www.linkedin.com/pulse/evidence-led-growth-abc",
      thumbnail: "urn:li:image:C49klciosC89",
      title: "Evidence-led growth",
      description: "A short editorial dispatch.",
    },
  },
  id: "urn:li:share:6856921137721544704",
  commentary: "Read our latest newsletter.",
};

const parsedArticle = {
  sourceId: "linkedin:urn:li:share:6856921137721544704",
  sourceUrl: officialArticlePostFixture.content.article.source,
  title: officialArticlePostFixture.content.article.title,
  excerpt: officialArticlePostFixture.content.article.description,
  thumbnailUrn: officialArticlePostFixture.content.article.thumbnail,
  publishedAt: "2021-10-21T11:56:34.721Z",
};

test("maps the documented LinkedIn article-post fixture without inference", () => {
  assert.deepEqual(parseLinkedInArticlePost(officialArticlePostFixture, authorUrn), parsedArticle);
});

test("rejects non-article, private, draft, and wrong-organization posts", () => {
  assert.equal(parseLinkedInArticlePost({ ...officialArticlePostFixture, content: {} }, authorUrn), undefined);
  assert.equal(parseLinkedInArticlePost({ ...officialArticlePostFixture, visibility: "CONTAINER" }, authorUrn), undefined);
  assert.equal(parseLinkedInArticlePost({ ...officialArticlePostFixture, lifecycleState: "DRAFT" }, authorUrn), undefined);
  assert.equal(
    parseLinkedInArticlePost(
      { ...officialArticlePostFixture, author: "urn:li:organization:999" },
      authorUrn,
    ),
    undefined,
  );
});

test("resolves the documented Images API response into the CMS shape", () => {
  assert.deepEqual(
    completeLinkedInNewsletterRecord(
      parsedArticle,
      { downloadUrl: "https://media.licdn-ei.com/dms/image/example" },
      "Könsälidön",
    ),
    {
      sourceId: parsedArticle.sourceId,
      sourceUrl: parsedArticle.sourceUrl,
      title: parsedArticle.title,
      excerpt: parsedArticle.excerpt,
      image: "https://media.licdn-ei.com/dms/image/example",
      author: { name: "Könsälidön" },
      category: APPROVED_NEWSLETTER_CATEGORY,
      publishedAt: parsedArticle.publishedAt,
    },
  );
  assert.equal(completeLinkedInNewsletterRecord(parsedArticle, {}, "Könsälidön"), undefined);
});

test("builds a draft-only CMS insert with stable duplicate identity", () => {
  const record = completeLinkedInNewsletterRecord(
    parsedArticle,
    { downloadUrl: "https://media.licdn-ei.com/dms/image/example" },
    "Könsälidön",
  );
  assert.ok(record);
  const draft = buildLinkedInEditorialDraft(record, "evidence-led-growth-abcd1234");
  assert.equal(draft.status, "draft");
  assert.equal(draft.collection, "newsletters");
  assert.equal(draft.sourceId, "linkedin:urn:li:share:6856921137721544704");
  assert.equal(draft.data.sourceId, draft.sourceId);
  assert.equal(draft.data.sourceUrl, officialArticlePostFixture.content.article.source);

  const editedFixture = {
    ...officialArticlePostFixture,
    content: {
      article: {
        ...officialArticlePostFixture.content.article,
        title: "An edited title",
      },
    },
  };
  assert.equal(
    parseLinkedInArticlePost(editedFixture, authorUrn)?.sourceId,
    parsedArticle.sourceId,
  );
});

test("does not build a record when the documented image download URL is absent", () => {
  assert.equal(completeLinkedInNewsletterRecord(parsedArticle, {}, "Könsälidön"), undefined);
});

test("pins organization identity to the approved vanity name", () => {
  assert.equal(
    approvedLinkedInOrganizationName({ vanityName: "konsälidön", localizedName: "Könsälidön" }),
    "Könsälidön",
  );
  assert.equal(
    approvedLinkedInOrganizationName({ vanityName: "another-company", localizedName: "Könsälidön" }),
    undefined,
  );
});

test("follows LinkedIn next links even when a page is short", () => {
  assert.equal(
    getNextLinkedInPageStart(
      {
        paging: {
          links: [{
            rel: "next",
            href: "/rest/posts?author=urn%3Ali%3Aorganization%3A2414183&start=7&count=100",
          }],
        },
      },
      0,
      7,
      7,
      100,
    ),
    7,
  );
  assert.equal(getNextLinkedInPageStart({ paging: { links: [] } }, 100, 25, 125, 100), undefined);
});

test("keeps the confirmed approved source URL", () => {
  assert.equal(
    APPROVED_LINKEDIN_SOURCE_URL,
    "https://www.linkedin.com/company/kons%C3%A4lid%C3%B6n/posts/?feedView=all",
  );
});