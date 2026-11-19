import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  db,
  editorialItemsTable,
  newsletterSourceRunsTable,
  newsletterSourcesTable,
} from "@workspace/db";
import { and, eq, inArray, like } from "drizzle-orm";
import {
  claimAndRunDueNewsletterSources,
  createDraft,
  gmailSourceId,
  runNewsletterSource,
  type ClaimedNewsletterRun,
} from "./gmailNewsletterIngestion";

test("scheduled claims are independent, recover stale leases, and draft ingestion deduplicates", async () => {
  const marker = `gmail-integration-${randomUUID()}`;
  const createdSourceIds: string[] = [];
  const createdDraftSourceIds: string[] = [];
  const [contributor] = await db.insert(editorialItemsTable).values({
    collection: "contributors",
    slug: marker,
    title: "Fallback title",
    status: "draft",
    sourceId: `${marker}:contributor`,
    data: { name: "Integration Contributor" },
  }).returning();
  const addSource = async (suffix: string, enabled = true, nextRunAt = new Date(Date.now() - 60_000)) => {
    const [source] = await db.insert(newsletterSourcesTable).values({
      name: `${marker}-${suffix}`,
      senderEmail: `${suffix}@example.test`,
      subjectKeywords: ["Edition"],
      instructions: "",
      referenceUrls: [],
      contributorId: contributor!.id,
      enabled,
      nextRunAt,
    }).returning();
    createdSourceIds.push(source!.id);
    return source!;
  };
  const complete = async (claim: ClaimedNewsletterRun) => {
    await db.update(newsletterSourceRunsTable).set({
      status: "succeeded",
      completedAt: new Date(),
      message: "integration completion",
    }).where(eq(newsletterSourceRunsTable.id, claim.run.id));
  };

  try {
    const first = await addSource("first");
    const second = await addSource("second");
    assert.equal(
      await claimAndRunDueNewsletterSources(complete, [first.id, second.id]),
      2,
      "both independently claimed sources should execute",
    );
    const broken = await addSource("broken-worker", true, new Date(Date.now() - 120_000));
    const afterBroken = await addSource("after-broken-worker", true, new Date(Date.now() - 60_000));
    assert.equal(await claimAndRunDueNewsletterSources(async (claim) => {
      if (claim.source.id === broken.id) throw new Error("injected worker failure");
      await complete(claim);
    }, [broken.id, afterBroken.id]), 1);
    const [brokenSource] = await db.select().from(newsletterSourcesTable)
      .where(eq(newsletterSourcesTable.id, broken.id));
    const [brokenRun] = await db.select().from(newsletterSourceRunsTable)
      .where(eq(newsletterSourceRunsTable.sourceId, broken.id));
    assert.equal(brokenRun!.status, "failed");
    assert.ok(brokenSource!.nextRunAt!.getTime() <= Date.now(), "failed source remains due");

    const conflicted = await addSource("manual-conflict");
    const next = await addSource("after-conflict");
    const conflictedDue = conflicted.nextRunAt!.getTime();
    await db.insert(newsletterSourceRunsTable).values({
      sourceId: conflicted.id,
      sourceVersion: conflicted.version,
      status: "running",
    });
    assert.equal(await claimAndRunDueNewsletterSources(complete, [conflicted.id, next.id]), 1);
    const [unchangedConflict] = await db.select().from(newsletterSourcesTable)
      .where(eq(newsletterSourcesTable.id, conflicted.id));
    assert.equal(unchangedConflict!.nextRunAt!.getTime(), conflictedDue);

    const stale = await addSource("stale", true, new Date(Date.now() + 86_400_000));
    const [staleRun] = await db.insert(newsletterSourceRunsTable).values({
      sourceId: stale.id,
      sourceVersion: stale.version,
      status: "running",
      startedAt: new Date(Date.now() - 31 * 60_000),
    }).returning();
    assert.equal(await claimAndRunDueNewsletterSources(complete, [stale.id]), 1);
    const recoveredRuns = await db.select().from(newsletterSourceRunsTable)
      .where(eq(newsletterSourceRunsTable.sourceId, stale.id));
    assert.equal(recoveredRuns.find((run) => run.id === staleRun!.id)?.status, "failed");
    assert.equal(recoveredRuns.some((run) => run.status === "succeeded"), true);

    const paused = await addSource("paused", false, new Date(Date.now() - 60_000));
    await db.insert(newsletterSourceRunsTable).values({
      sourceId: paused.id,
      sourceVersion: paused.version,
      status: "running",
      startedAt: new Date(Date.now() - 31 * 60_000),
    });
    assert.equal(await claimAndRunDueNewsletterSources(complete, [paused.id]), 0);
    const pausedRuns = await db.select().from(newsletterSourceRunsTable)
      .where(eq(newsletterSourceRunsTable.sourceId, paused.id));
    assert.deepEqual(pausedRuns.map((run) => run.status), ["failed"]);
    const deleted = await addSource("deleted");
    await db.delete(newsletterSourcesTable).where(eq(newsletterSourcesTable.id, deleted.id));
    assert.equal(await claimAndRunDueNewsletterSources(complete, [deleted.id]), 0);

    const draftSource = await addSource("draft", false, null as never);
    const message = {
      id: "realistic-message",
      threadId: "realistic-thread",
      sender: "Publisher <draft@example.test>",
      subject: "Edition: Evidence",
      snippet: "An evidenced excerpt",
      date: "2026-01-01T02:00:00Z",
    };
    const sourceId = gmailSourceId("integration-mailbox@example.test", message.id);
    createdDraftSourceIds.push(sourceId);
    const extracted = {
      title: "Edition: Evidence",
      excerpt: "An evidenced excerpt",
      articleUrl: `https://example.test/${marker}/article`,
    };
    const assignment = { id: contributor!.id, name: "Integration Contributor" };
    let fullFetches = 0;
    let aiCalls = 0;
    const dependencies = {
      mailboxIdentity: async () => "integration-mailbox@example.test",
      fetchCandidates: async () => ({ messages: [message], hasMore: false, errors: [] }),
      fetchFullMessage: async () => {
        fullFetches += 1;
        return {
          payload: {
            mimeType: "text/html",
            body: {
              data: Buffer.from(
                `<p>${extracted.excerpt}</p><a href="${extracted.articleUrl}">${extracted.title}</a>`,
              ).toString("base64url"),
            },
          },
        };
      },
      classify: async () => {
        aiCalls += 1;
        return { matches: true, ...extracted };
      },
    };
    const firstReport = await runNewsletterSource(draftSource.id, true, undefined, dependencies);
    assert.equal(firstReport.created, 1);
    const secondReport = await runNewsletterSource(draftSource.id, true, undefined, dependencies);
    assert.equal(secondReport.created, 0);
    assert.equal(secondReport.skipped, 1);
    assert.equal(fullFetches, 1, "dedup precheck must avoid the second full-message fetch");
    assert.equal(aiCalls, 1, "dedup precheck must avoid the second AI classification");

    const manualUrl = `https://example.test/${marker}/manual`;
    const manualSourceId = `${marker}:manual`;
    createdDraftSourceIds.push(manualSourceId);
    await db.insert(editorialItemsTable).values({
      collection: "newsletters",
      slug: `${marker}-manual`,
      title: "Manual duplicate",
      status: "draft",
      sourceId: manualSourceId,
      data: { url: manualUrl },
    });
    const duplicateMessageId = gmailSourceId("integration-mailbox@example.test", "manual-duplicate");
    createdDraftSourceIds.push(duplicateMessageId);
    assert.equal(await createDraft(
      draftSource,
      assignment,
      { ...message, id: "manual-duplicate" },
      { ...extracted, articleUrl: `${manualUrl}?utm_source=email` },
      duplicateMessageId,
    ), undefined);
  } finally {
    if (createdSourceIds.length) {
      await db.delete(newsletterSourcesTable).where(inArray(newsletterSourcesTable.id, createdSourceIds));
    }
    await db.delete(editorialItemsTable).where(like(editorialItemsTable.sourceId, `${marker}%`));
    if (createdDraftSourceIds.length) {
      await db.delete(editorialItemsTable).where(inArray(editorialItemsTable.sourceId, createdDraftSourceIds));
    }
    await db.delete(editorialItemsTable).where(and(
      eq(editorialItemsTable.collection, "contributors"),
      eq(editorialItemsTable.id, contributor!.id),
    ));
  }
});