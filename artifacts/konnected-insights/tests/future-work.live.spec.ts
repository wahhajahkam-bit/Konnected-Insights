import { createHash, randomUUID } from 'node:crypto';

import { expect, test as base, type Page } from '@playwright/test';
import { createNewsletterFixture } from './helpers/newsletter-live-fixture';
import { assertSavedSourceTestEnvironment } from '../../../scripts/saved-source-test-guard.mjs';

type JsonResponse = {
  status: number;
  body: any;
};

const test = base.extend<{
  staff: Awaited<ReturnType<typeof createNewsletterFixture>>;
}>({
  staff: [async ({}, use, testInfo) => {
    if (testInfo.title.startsWith('saved-source preflight isolates')) {
      assertSavedSourceTestEnvironment();
    }
    const fixture = await createNewsletterFixture();
    try {
      await use(fixture);
    } finally {
      await fixture.cleanup();
    }
  }, { timeout: 120_000 }],
});

// This file creates a real Clerk test identity and writes only isolated synthetic
// rows to the development database. The dedicated project is opt-in as well.
test.skip(process.env.FUTURE_WORK_LIVE !== '1', 'Uses a real development Clerk identity and database.');

/** Same-origin cookie authentication, exactly as used by the application. */
async function api(page: Page, path: string, method = 'GET', body?: unknown): Promise<JsonResponse> {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      // The assertions below report only status, never an upstream body.
    }
    return { status: response.status, body: parsed };
  }, { path, method, body });
}

async function signInInvitedStaff(
  page: Page,
  staff: Awaited<ReturnType<typeof createNewsletterFixture>>,
) {
  await page.goto('/admin/future-work');
  await page.waitForFunction(() => Boolean((window as any).Clerk?.loaded));
  const ticket = await staff.createSignInToken();
  const signedIn = await page.evaluate(async ticketValue => {
    try {
      const clerk = (window as any).Clerk;
      const attempt = await clerk.client.signIn.create({ strategy: 'ticket', ticket: ticketValue });
      if (attempt.status !== 'complete') return false;
      await clerk.setActive({ session: attempt.createdSessionId });
      return true;
    } catch {
      return false;
    }
  }, ticket);
  expect(signedIn).toBe(true);
  await staff.approveEditor();
}

function allPublicIds(body: any): string[] {
  const data = body?.data;
  if (!data || typeof data !== 'object') return [];
  return ['content', 'programs', 'news']
    .flatMap(key => Array.isArray(data[key]) ? data[key] : [])
    .map(item => item?.id)
    .filter((id): id is string => typeof id === 'string');
}

test('history live regression: authenticated decisions endpoint and UI load safely', async ({ page, staff }) => {
  await signInInvitedStaff(page, staff);
  await page.goto('/admin/future-work');

  const history = await api(page, '/editorial/future-work/history/decisions?category=all&limit=20');
  const safeMessage = typeof history.body?.error?.message === 'string'
    ? history.body.error.message
    : typeof history.body?.error === 'string'
      ? history.body.error
      : null;
  console.info(`Authenticated history decisions: status=${history.status} message=${safeMessage || 'none'}`);
  expect(history.status).toBe(200);
  expect(history.body?.data?.items).toEqual(expect.any(Array));
  expect(
    history.body?.data?.nextCursor === null || typeof history.body?.data?.nextCursor === 'string',
  ).toBe(true);

  await page.getByTestId('tab-history').click();
  await expect(page.getByRole('region', { name: 'Editorial decision history' })).toBeVisible();
  await expect(page.getByTestId('status-decision-history-loading')).toHaveCount(0);
  await expect(page.getByTestId('status-decision-history-error')).toHaveCount(0);
  await expect(page.getByText('Editorial decision timeline', { exact: true })).toBeVisible();
});

test('history live regression: filters paginate and inspect preserved evidence', async ({ page, staff }) => {
  test.setTimeout(180_000);
  await signInInvitedStaff(page, staff);

  const functionId = randomUUID();
  const nonexistentFunctionId = randomUUID();
  const predecessorId = randomUUID();
  const versions = {
    '2030': randomUUID(),
    '2050': randomUUID(),
    '2100': randomUUID(),
    news: randomUUID(),
    programs: randomUUID(),
  };
  const marker = staff.runId;
  const evidenceTitle = `Preserved history evidence ${marker}`;
  const predecessorTitle = `Preserved predecessor ${marker}`;
  const source = {
    url: `https://www.oecd.org/synthetic-history-${marker}`,
    title: evidenceTitle,
    publisher: 'OECD',
    publishedAt: '2026-01-15T12:00:00.000Z',
    fetchedAt: '2026-01-16T12:00:00.000Z',
    excerpt: `Isolated development history evidence ${marker}`,
    authenticity: 'Synthetic development fixture',
    contentHash: createHash('sha256').update(marker).digest('hex'),
  };
  const decisionIds: string[] = [];
  const categoryDecisionIds: Record<keyof typeof versions, string[]> = {
    '2030': [], '2050': [], '2100': [], news: [], programs: [],
  };
  const contentIds = [predecessorId, versions['2030'], versions['2050'], versions['2100']];

  try {
    await test.step('seed isolated versions and more than one decision page', async () => {
      await staff.query(
        `INSERT INTO future_work_functions
           (id, slug, name, description, sort_order, enabled, revision, presentation)
         VALUES ($1, $2, $3, 'Isolated development history fixture', 999998, true, 1, '{}')`,
        [functionId, `history-regression-${marker}`, `History fixture ${marker}`],
      );
      await staff.query(
        `INSERT INTO future_of_work_content
           (id, function_id, horizon, lens, slot, status, data, revision,
            previous_version_id, last_verified_at, updated_at)
         VALUES
           ($1, $2, 2030, 'technology', $3, 'superseded', $4, 1, null, now(), now() - interval '2 minutes'),
           ($5, $2, 2030, 'technology', $6, 'superseded', $7, 2, $1, now(), now()),
           ($8, $2, 2050, 'field', $9, 'superseded', $10, 1, null, now(), now()),
           ($11, $2, 2100, 'technology', $12, 'superseded', $13, 1, null, now(), now())`,
        [
          predecessorId, functionId, `${functionId}:content:2030:technology:predecessor`,
          { title: predecessorTitle, summary: 'Earlier preserved snapshot.', sources: [source], skills: ['Historical judgment'] },
          versions['2030'], `${functionId}:content:2030:technology`,
          { title: `2030 history ${marker}`, summary: 'Synthetic 2030 snapshot.', sources: [source], skills: ['Foresight'] },
          versions['2050'], `${functionId}:content:2050:field`,
          { title: `2050 history ${marker}`, summary: 'Synthetic 2050 snapshot.', sources: [source] },
          versions['2100'], `${functionId}:content:2100:technology`,
          { title: `2100 history ${marker}`, summary: 'Synthetic 2100 snapshot.', sources: [source] },
        ],
      );
      await staff.query(
        `INSERT INTO leading_programs
           (id, function_id, horizon, lens, slot, status, data, revision, last_verified_at, updated_at)
         VALUES ($1, $2, 2030, 'field', $3, 'superseded', $4, 1, now(), now())`,
        [versions.programs, functionId, `${functionId}:programs:history`, {
          organization: 'Synthetic History Institute',
          programName: `History program ${marker}`,
          description: 'Synthetic preserved program snapshot.',
          classification: 'accept',
          rationale: 'Isolated history regression.',
          sources: [source],
        }],
      );
      await staff.query(
        `INSERT INTO future_work_news
           (id, function_id, horizon, lens, slot, status, data, revision, last_verified_at, updated_at)
         VALUES ($1, $2, 2030, 'technology', $3, 'superseded', $4, 1, now(), now())`,
        [versions.news, functionId, `${functionId}:news:history`, {
          title: `History news ${marker}`,
          summary: 'Synthetic preserved news snapshot.',
          sources: [source],
        }],
      );

      const categories: Array<keyof typeof versions> = [
        ...Array.from({ length: 17 }, () => '2030' as const),
        '2050', '2100', 'news', 'programs',
      ];
      for (const [offset, category] of categories.entries()) {
        const id = randomUUID();
        const kind = category === 'news' || category === 'programs' ? category : 'content';
        decisionIds.push(id);
        categoryDecisionIds[category].push(id);
        await staff.query(
          `INSERT INTO future_work_decisions
             (id, kind, version_id, action, actor, reason, created_at)
           VALUES ($1, $2, $3, $4, 'history-live-test', $5, now() - ($6 * interval '1 second'))`,
          [id, kind, versions[category], offset % 2 ? 'verify_unchanged' : 'approve',
            `Isolated ${category} decision ${offset} ${marker}`, offset],
        );
      }
    });

    await page.goto('/admin/future-work');

    await test.step('real API covers filters, an empty UUID, and cursor pagination', async () => {
      const allFunctions = await api(page, '/editorial/future-work/history/decisions?category=all&limit=100');
      expect(allFunctions.status).toBe(200);
      expect(allFunctions.body.data.items.map((item: any) => item.id)).toEqual(expect.arrayContaining(decisionIds));

      const expectedKinds: Record<keyof typeof versions, string> = {
        '2030': 'content', '2050': 'content', '2100': 'content', news: 'news', programs: 'programs',
      };
      for (const category of Object.keys(versions) as Array<keyof typeof versions>) {
        const response = await api(
          page,
          `/editorial/future-work/history/decisions?functionId=${functionId}&category=${category}&limit=100`,
        );
        expect(response.status).toBe(200);
        expect(response.body.data.nextCursor).toBeNull();
        expect(response.body.data.items.map((item: any) => item.id)).toEqual(categoryDecisionIds[category]);
        expect(response.body.data.items.every((item: any) => item.kind === expectedKinds[category])).toBe(true);
      }

      const empty = await api(
        page,
        `/editorial/future-work/history/decisions?functionId=${nonexistentFunctionId}&category=all&limit=20`,
      );
      expect(empty.status).toBe(200);
      expect(empty.body.data).toEqual({ items: [], nextCursor: null });

      const paginatedIds: string[] = [];
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams({ functionId, category: 'all', limit: '5' });
        if (cursor) query.set('cursor', cursor);
        const response = await api(page, `/editorial/future-work/history/decisions?${query}`);
        expect(response.status).toBe(200);
        paginatedIds.push(...response.body.data.items.map((item: any) => item.id));
        cursor = response.body.data.nextCursor;
      } while (cursor);
      expect(paginatedIds).toEqual(decisionIds);
      expect(new Set(paginatedIds).size).toBe(decisionIds.length);
    });

    await test.step('real version APIs preserve evidence for every resource kind', async () => {
      for (const [category, id] of Object.entries(versions)) {
        const kind = category === 'news' || category === 'programs' ? category : 'content';
        const response = await api(page, `/editorial/future-work/history/versions/${kind}/${id}`);
        expect(response.status).toBe(200);
        expect(response.body.data.version).toMatchObject({
          id,
          functionId,
          sources: [expect.objectContaining({ title: evidenceTitle, excerpt: source.excerpt })],
        });
        expect(response.body.data.decisions).toHaveLength(
          categoryDecisionIds[category as keyof typeof versions].length,
        );
      }
    });

    await test.step('History UI covers all and specific filters plus pagination', async () => {
      await page.getByTestId('tab-history').click();
      const functionFilter = page.getByRole('combobox', { name: '1. Choose function' });
      const categoryFilter = page.getByRole('combobox', { name: '2. Horizon / category' });

      await functionFilter.selectOption('');
      await categoryFilter.selectOption('all');
      await expect(page.getByTestId(`decision-history-${decisionIds[0]}`)).toBeVisible();

      await functionFilter.selectOption(functionId);
      await expect(page.getByTestId('button-decision-history-earlier')).toBeVisible();
      await page.getByTestId('button-decision-history-earlier').click();
      for (const id of decisionIds) {
        await expect(page.getByTestId(`decision-history-${id}`)).toBeVisible();
      }

      for (const category of Object.keys(versions) as Array<keyof typeof versions>) {
        await categoryFilter.selectOption(category);
        await expect(page.locator('[data-testid^="decision-history-"]')).toHaveCount(categoryDecisionIds[category].length);
        for (const id of categoryDecisionIds[category]) {
          await expect(page.getByTestId(`decision-history-${id}`)).toBeVisible();
        }
      }
    });

    await test.step('History UI inspects current and predecessor evidence', async () => {
      await page.getByRole('combobox', { name: '2. Horizon / category' }).selectOption('2030');
      const card = page.getByTestId(`decision-history-${categoryDecisionIds['2030'][0]}`);
      await card.getByRole('button', { name: 'Inspect version & evidence' }).click();
      const panel = page.getByTestId('panel-history-version');
      await expect(panel).toContainText(`2030 history ${marker}`);
      await expect(panel).toContainText(evidenceTitle);
      await expect(panel).toContainText(source.excerpt);
      await expect(panel.getByText('Decisions for this version', { exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Open previous version' }).click();
      await expect(panel).toContainText(predecessorTitle);
      await expect(panel).toContainText(evidenceTitle);
      await expect(panel.getByText('No decisions were recorded for this version.', { exact: true })).toBeVisible();
    });
  } finally {
    await staff.query('DELETE FROM future_work_decisions WHERE id = ANY($1::uuid[])', [decisionIds]);
    await staff.query('DELETE FROM future_of_work_content WHERE id = ANY($1::uuid[])', [contentIds]);
    await staff.query('DELETE FROM leading_programs WHERE id = $1', [versions.programs]);
    await staff.query('DELETE FROM future_work_news WHERE id = $1', [versions.news]);
    await staff.query('DELETE FROM future_work_functions WHERE id = $1', [functionId]);
    const leftovers = await staff.query(
      `SELECT id FROM future_work_functions WHERE id = $1
       UNION ALL SELECT id FROM future_work_decisions WHERE id = ANY($2::uuid[])
       UNION ALL SELECT id FROM future_of_work_content WHERE id = ANY($3::uuid[])
       UNION ALL SELECT id FROM leading_programs WHERE id = $4
       UNION ALL SELECT id FROM future_work_news WHERE id = $5`,
      [functionId, decisionIds, contentIds, versions.programs, versions.news],
    );
    expect(leftovers.rowCount).toBe(0);
  }
});

test('history live regression: loaded pages recover manually from an invalid cursor', async ({ page, staff }) => {
  await signInInvitedStaff(page, staff);

  const firstDecision = {
    id: randomUUID(),
    kind: 'content',
    versionId: randomUUID(),
    action: 'approve',
    actor: 'history-test@example.com',
    reason: 'Initial loaded decision',
    createdAt: '2026-01-02T00:00:00.000Z',
    version: {
      id: randomUUID(),
      functionId: randomUUID(),
      status: 'published',
      revision: 1,
      title: 'Preserved loaded history',
    },
  };
  const earlierDecision = {
    ...firstDecision,
    id: randomUUID(),
    versionId: randomUUID(),
    reason: 'Recovered earlier decision',
    createdAt: '2026-01-01T00:00:00.000Z',
    version: {
      ...firstDecision.version,
      id: randomUUID(),
      revision: 2,
      title: 'Earlier history after retry',
    },
  };
  let cursorRequests = 0;

  await page.route('**/api/editorial/future-work/history/decisions?**', async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    if (!cursor) {
      await route.fulfill({ json: { data: { items: [firstDecision], nextCursor: 'next-page' } } });
      return;
    }

    cursorRequests += 1;
    if (cursorRequests === 1) {
      await route.fulfill({
        status: 400,
        json: { error: { message: 'sensitive raw cursor diagnostics' } },
      });
      return;
    }
    await route.fulfill({ json: { data: { items: [earlierDecision], nextCursor: null } } });
  });

  await page.goto('/admin/future-work');
  await page.getByTestId('tab-history').click();
  await expect(page.getByText('Preserved loaded history', { exact: true })).toBeVisible();
  await page.getByTestId('button-decision-history-earlier').click();

  const pageError = page.getByTestId('status-decision-history-earlier-error');
  await expect(pageError).toContainText('The history filters or cursor are invalid.');
  await expect(page.getByTestId('status-decision-history-error')).toHaveCount(0);
  await expect(page.getByText('Preserved loaded history', { exact: true })).toBeVisible();
  await expect(page.getByText('sensitive raw cursor diagnostics')).toHaveCount(0);
  expect(cursorRequests).toBe(1);

  await pageError.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Earlier history after retry', { exact: true })).toBeVisible();
  await expect(pageError).toHaveCount(0);
  expect(cursorRequests).toBe(2);
});

test('staff review versions remain private until approved and preserve restorable history', async ({ page, staff }) => {
  test.setTimeout(240_000);

  const functionId = randomUUID();
  const approvedId = randomUUID();
  const candidateId = randomUUID();
  const rejectId = randomUUID();
  const programId = randomUUID();
  const versionIds = new Set([approvedId, candidateId, rejectId, programId]);
  const marker = staff.runId;
  const slug = `synthetic-future-work-${marker}`;
  const originalTitle = `Synthetic approved baseline ${marker}`;
  const candidateTitle = `Synthetic private candidate ${marker}`;
  const editedTitle = `Synthetic reviewed future ${marker}`;
  const rejectedTitle = `Synthetic rejected future ${marker}`;
  const skillA = `Synthetic systems skill ${marker}`;
  const skillB = `Synthetic evidence skill ${marker}`;
  const presentationIntro = `Synthetic function-first introduction ${marker}`;
  const overviewIntro = `Synthetic editorial overview ${marker}`;
  const outlookIntro = `Synthetic outlook framing ${marker}`;
  const now = new Date().toISOString();
  const fetchedText = (
    `Synthetic development evidence for ${marker}. This controlled fixture describes how verified institutional research can inform a human-reviewed future-of-work outlook without representing a real publication or claim. ` +
    'It discusses evidence assessment, accountable technology adoption, workforce transition planning, durable professional skills, transparent source review, and the need to separate proposed editorial material from approved public content. ' +
    'The text is intentionally long enough to exercise the same fetched-evidence integrity boundary used by production research. It exists only in the isolated development database for the duration of this regression. ' +
    'Reviewers compare candidate versions with approved history, confirm publisher identity and timestamps, inspect deterministic hashes, and explicitly approve or reject every proposed change. '
  ).repeat(2);
  const contentHash = createHash('sha256').update(fetchedText).digest('hex');
  const excerptHash = createHash('sha256').update(fetchedText).digest('hex');
  const sourceUrl = `https://www.weforum.org/stories/synthetic-future-work-${marker}`;
  const source = {
    url: sourceUrl,
    title: `Synthetic evidence ${marker}`,
    publisher: 'weforum.org',
    publisherName: 'World Economic Forum',
    publishedAt: now,
    fetchedAt: now,
    excerpt: fetchedText,
    author: null,
    authenticity: 'Synthetic fixture shaped like content fetched from a verified institutional publisher domain.',
    contentHash,
    verification: {
      method: 'dns-pinned-http',
      finalUrl: sourceUrl,
      publisherIdentity: 'weforum.org',
      fetchedAt: now,
      excerptHash,
    },
  };

  try {
    await test.step('seed only uniquely identified synthetic versions', async () => {
      await staff.query(
        `INSERT INTO future_work_functions
           (id, slug, name, description, sort_order, enabled, revision, presentation)
         VALUES ($1, $2, $3, $4, 999999, true, 1, $5)`,
        [functionId, slug, `Synthetic function ${marker}`, 'Development regression fixture',
          { heroCoverUrl: '/logo.svg', heroAlt: 'Synthetic fixture cover' }],
      );
      await staff.query(
        `INSERT INTO future_of_work_content
           (id, function_id, horizon, lens, slot, status, data, revision,
            approved_at, published_at, last_verified_at, updated_at)
         VALUES
           ($1, $2, 2030, 'technology', $3, 'published', $4, 1, now(), now(), now(), now()),
           ($5, $2, 2030, 'technology', $3, 'pending_review', $6, 1, null, null, now(), now()),
           ($7, $2, 2050, 'field', $8, 'pending_review', $9, 1, null, null, now(), now())`,
        [
          approvedId,
          functionId,
          `${functionId}:2030:technology`,
          { title: originalTitle, summary: 'Synthetic approved summary.', skills: ['Synthetic baseline skill'], sources: [source] },
          candidateId,
          { title: candidateTitle, summary: 'Private proposal awaiting staff review.', skills: ['Synthetic draft skill'], sources: [source] },
          rejectId,
          `${functionId}:2050:field`,
          { title: rejectedTitle, summary: 'Synthetic proposal intended for rejection.', skills: [], sources: [source] },
        ],
      );
      await staff.query(
        `UPDATE future_of_work_content SET previous_version_id = $1 WHERE id = $2`,
        [approvedId, candidateId],
      );
      await staff.query(
        `INSERT INTO leading_programs
           (id, function_id, horizon, lens, slot, status, data, revision, last_verified_at, updated_at)
         VALUES ($1, $2, 2030, 'field', $3, 'pending_review', $4, 1, now(), now())`,
        [
          programId,
          functionId,
          `${functionId}:programs:guardrail`,
          {
            organization: 'Synthetic Institute',
            programName: `Synthetic legacy course ${marker}`,
            description: 'A deliberately non-future-focused program fixture.',
            sourceUrl: source.url,
            sources: [source],
            classification: 'reject',
            rationale: 'Synthetic guardrail fixture.',
          },
        ],
      );
    });

    await test.step('pending and rejected candidates never appear in public responses', async () => {
      await page.goto('/future-of-work');
      const overview = await api(page, '/future-work');
      expect(overview.status).toBe(200);
      expect(allPublicIds(overview.body)).toContain(approvedId);
      for (const privateId of [candidateId, rejectId, programId]) {
        expect(allPublicIds(overview.body)).not.toContain(privateId);
      }

      const detail = await api(page, `/future-work/functions/${slug}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.content.map((item: any) => item.id)).toEqual([approvedId]);
      expect(detail.body.data.programs).toEqual([]);
      expect(JSON.stringify(detail.body)).not.toContain(candidateTitle);
      expect(JSON.stringify(detail.body)).not.toContain(rejectedTitle);
    });

    await test.step('sign in with a single-use Clerk ticket and approve exact editor identity', async () => {
      await page.goto('/admin/future-work');
      await page.waitForFunction(() => Boolean((window as any).Clerk?.loaded));
      const ticket = await staff.createSignInToken();
      const signedIn = await page.evaluate(async ticketValue => {
        try {
          const clerk = (window as any).Clerk;
          const attempt = await clerk.client.signIn.create({ strategy: 'ticket', ticket: ticketValue });
          if (attempt.status !== 'complete') return false;
          await clerk.setActive({ session: attempt.createdSessionId });
          return true;
        } catch {
          return false;
        }
      }, ticket);
      expect(signedIn).toBe(true);
      await staff.approveEditor();
      await page.goto('/admin/future-work');
      await expect(page.getByRole('heading', { name: 'Future of Work Research Desk' })).toBeVisible();
      await page.getByTestId('tab-pending').click();
      await expect(page.getByTestId(`card-review-${candidateId}`)).toBeVisible();
    });

    await test.step('presentation metadata saves, reloads, and renders publicly', async () => {
      await page.getByTestId('tab-functions').click();
      await page.getByTestId(`button-function-edit-${functionId}`).click();
      await expect(page.getByLabel('Hero cover', { exact: true })).toHaveValue('/logo.svg');
      await page.getByRole('button', { name: 'Remove cover', exact: true }).click();
      await expect(page.getByLabel('Hero cover', { exact: true })).toHaveValue('');
      await page.getByLabel('Short introduction', { exact: true }).fill(presentationIntro);
      await page.getByText('Section introductions', { exact: true }).click();
      await page.getByLabel('overview', { exact: true }).fill(overviewIntro);
      await page.getByLabel('outlook', { exact: true }).fill(outlookIntro);

      const savedResponse = page.waitForResponse(response =>
        new URL(response.url()).pathname === `/api/editorial/future-work/functions/${functionId}` &&
        response.request().method() === 'PATCH',
      );
      await page.getByTestId('button-save-function').click();
      const presentationSaved = await savedResponse;
      expect(presentationSaved.status()).toBe(200);
      expect(presentationSaved.request().postDataJSON().presentation).not.toHaveProperty('heroCoverUrl');

      await page.reload();
      await page.getByTestId('tab-functions').click();
      await page.getByTestId(`button-function-edit-${functionId}`).click();
      await expect(page.getByLabel('Hero cover', { exact: true })).toHaveValue('');
      await expect(page.getByLabel('Short introduction', { exact: true })).toHaveValue(presentationIntro);
      await page.getByText('Section introductions', { exact: true }).click();
      await expect(page.getByLabel('outlook', { exact: true })).toHaveValue(outlookIntro);
      await expect(page.getByLabel('overview', { exact: true })).toHaveValue(overviewIntro);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();

      await page.goto(`/future-of-work/${slug}?horizon=2030`);
      await expect(page.getByText(presentationIntro, { exact: true })).toBeVisible();
      await expect(page.locator('#overview')).toContainText(overviewIntro);
      await expect(page.locator('main #overview')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toHaveCount(0);
      await expect(page.getByText(outlookIntro, { exact: true })).toBeVisible();
      await expect(page.getByRole('img', { name: 'Synthetic fixture cover' })).toHaveCount(0);

      await page.goto('/admin/future-work');
      await page.getByTestId('tab-pending').click();
      await expect(page.getByTestId(`card-review-${candidateId}`)).toBeVisible();
    });

    let editedId = '';
    let editedRevision = 0;
    await test.step('dashboard edit creates a distinct pending version', async () => {
      const card = page.getByTestId(`card-review-${candidateId}`);
      await card.getByTestId(`button-edit-${candidateId}`).click();
      await page.getByTestId('input-edit-title').fill(editedTitle);
      await page.getByTestId('input-edit-summary').fill(
        'A human-reviewed synthetic summary for the regression test, with enough detail to satisfy worker preflight validation.',
      );
      await page.getByTestId('input-edit-skills').fill(`${skillA}, ${skillB}`);
      await page.getByTestId('input-edit-reason').fill('Synthetic editorial regression review.');
      const responsePromise = page.waitForResponse(response =>
        new URL(response.url()).pathname === `/api/editorial/future-work/review/content/${candidateId}` &&
        response.request().method() === 'POST',
      );
      await page.getByTestId('button-save-edit').click();
      const response = responsePromise.then(async value => ({ status: value.status(), body: await value.json() }));
      const edited = await response;
      expect(edited.status).toBe(200);
      if (typeof edited.body?.data?.id === 'string') versionIds.add(edited.body.data.id);
      expect(edited.body.data).toMatchObject({
        functionId,
        status: 'pending_review',
        title: editedTitle,
        previousVersionId: candidateId,
        skills: [skillA, skillB],
      });
      editedId = edited.body.data.id;
      editedRevision = edited.body.data.revision;
      expect(editedId).not.toBe(candidateId);

      const rows = await staff.query(
        `SELECT id, status, revision, previous_version_id
           FROM future_of_work_content WHERE id = ANY($1::uuid[])`,
        [[candidateId, editedId]],
      );
      expect(rows.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: candidateId, status: 'superseded', revision: 2 }),
        expect.objectContaining({ id: editedId, status: 'pending_review', previous_version_id: candidateId }),
      ]));
      expect(allPublicIds((await api(page, '/future-work')).body)).not.toContain(editedId);
    });

    await test.step('optimistic conflict is 409 and approval publishes shared 2030 career skills', async () => {
      const stale = await api(page, `/editorial/future-work/review/content/${candidateId}`, 'POST', {
        action: 'approve',
        revision: 1,
      });
      expect(stale.status).toBe(409);
      expect(stale.body?.error).toEqual(expect.objectContaining({ message: expect.any(String) }));

      const approved = await api(page, `/editorial/future-work/review/content/${editedId}`, 'POST', {
        action: 'approve',
        revision: editedRevision,
        reason: 'Synthetic approval regression.',
      });
      expect(approved.status).toBe(200);
      expect(approved.body.data).toMatchObject({ id: editedId, status: 'published', title: editedTitle });
      editedRevision = approved.body.data.revision;

      const detail = await api(page, `/future-work/functions/${slug}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.content.map((item: any) => item.id)).toEqual([editedId]);
      expect(detail.body.data.skills).toEqual(expect.arrayContaining([skillA, skillB]));
      expect(detail.body.data.skills).not.toContain('Synthetic baseline skill');
    });

    await test.step('program publication guardrail rejects a non-future classification', async () => {
      const guarded = await api(page, `/editorial/future-work/review/programs/${programId}`, 'POST', {
        action: 'approve',
        revision: 1,
      });
      expect(guarded.status).toBe(400);
      expect(guarded.body?.error).toEqual(expect.objectContaining({ message: expect.any(String) }));
      const row = await staff.query('SELECT status, revision FROM leading_programs WHERE id = $1', [programId]);
      expect(row.rows[0]).toEqual({ status: 'pending_review', revision: 1 });
    });

    await test.step('staff can reject another proposal without making it public', async () => {
      page.once('dialog', dialog => dialog.accept('Synthetic rejection regression.'));
      const responsePromise = page.waitForResponse(response =>
        new URL(response.url()).pathname === `/api/editorial/future-work/review/content/${rejectId}` &&
        response.request().method() === 'POST',
      );
      await page.getByTestId('button-refresh-future-work').click();
      await expect(page.getByTestId(`card-review-${rejectId}`)).toBeVisible();
      await page.getByTestId(`button-reject-${rejectId}`).click();
      expect((await responsePromise).status()).toBe(200);
      const row = await staff.query('SELECT status FROM future_of_work_content WHERE id = $1', [rejectId]);
      expect(row.rows[0].status).toBe('rejected');
      expect(allPublicIds((await api(page, '/future-work')).body)).not.toContain(rejectId);
    });

    await test.step('unpublish hides the current version and restore reactivates approved history', async () => {
      const unpublished = await api(page, `/editorial/future-work/review/content/${editedId}`, 'POST', {
        action: 'unpublish',
        revision: editedRevision,
        reason: 'Synthetic unpublish regression.',
      });
      expect(unpublished.status).toBe(200);
      expect(unpublished.body.data.status).toBe('unpublished');
      expect(allPublicIds((await api(page, '/future-work')).body)).not.toContain(editedId);

      const baseline = await staff.query('SELECT revision, approved_at FROM future_of_work_content WHERE id = $1', [approvedId]);
      expect(baseline.rows[0].approved_at).not.toBeNull();
      const restored = await api(page, `/editorial/future-work/review/content/${approvedId}`, 'POST', {
        action: 'restore',
        revision: baseline.rows[0].revision,
        reason: 'Synthetic history restore regression.',
      });
      expect(restored.status).toBe(200);
      expect(restored.body.data).toMatchObject({ id: approvedId, status: 'published', title: originalTitle });
      const detail = await api(page, `/future-work/functions/${slug}`);
      expect(detail.body.data.content.map((item: any) => item.id)).toEqual([approvedId]);
      expect(detail.body.data.skills).toContain('Synthetic baseline skill');
      expect(detail.body.data.skills).not.toContain(skillA);
    });
  } finally {
    const ids = [...versionIds];
    // Decisions have no FK, but delete them first so cleanup is exact even if
    // assertions fail midway through the lifecycle.
    await staff.query('DELETE FROM future_work_decisions WHERE version_id = ANY($1::uuid[])', [ids]);
    await staff.query('DELETE FROM leading_programs WHERE id = ANY($1::uuid[])', [ids]);
    await staff.query('DELETE FROM future_work_news WHERE id = ANY($1::uuid[])', [ids]);
    await staff.query('DELETE FROM future_of_work_content WHERE id = ANY($1::uuid[])', [ids]);
    await staff.query('DELETE FROM future_work_functions WHERE id = $1', [functionId]);
    const leftovers = await staff.query(
      `SELECT id FROM future_work_functions WHERE id = $1
       UNION ALL SELECT id FROM future_of_work_content WHERE id = ANY($2::uuid[])
       UNION ALL SELECT id FROM leading_programs WHERE id = ANY($2::uuid[])
       UNION ALL SELECT id FROM future_work_news WHERE id = ANY($2::uuid[])`,
      [functionId, ids],
    );
    expect(leftovers.rowCount).toBe(0);
  }
});

test('research targeting sends exact selections and history exposes real rejection reasons', async ({ page, staff }) => {
  test.setTimeout(180_000);
  await signInInvitedStaff(page, staff);

  const operationsId = '33333333-3333-4333-8333-333333333333';
  const financeId = '44444444-4444-4444-8444-444444444444';
  const startedAt = '2026-02-01T12:00:00.000Z';
  const run = (
    id: string,
    functionId: string,
    name: string,
    horizon: number,
    outcome: 'published' | 'failed',
    rejected?: { url: string; reason: string }[],
  ) => ({
    id,
    scheduleId: 'research',
    status: 'completed',
    startedAt,
    finishedAt: startedAt,
    processed: 1,
    sourcesFound: 1,
    sourcesAccepted: outcome === 'published' ? 1 : 0,
    sourcesRejected: rejected?.length || 0,
    errors: [],
    usage: [],
    plan: [{ kind: 'content', horizon, lens: 'technology' }],
    outcomeCounts: { [outcome]: 1 },
    results: [{
      combination: { functionId, name, kind: 'content', horizon, lens: 'technology' },
      outcome,
      result: outcome === 'published' ? 'Published supported findings.' : 'No source passed policy.',
      searchQuery: `${name} ${horizon} workforce`,
      rejected,
    }],
  });
  const adminData = {
    functions: [
      { id: operationsId, slug: 'mock-operations', name: 'Mock Operations', description: '', sortOrder: 1, enabled: true, revision: 1, presentation: {} },
      { id: financeId, slug: 'mock-finance', name: 'Mock Finance', description: '', sortOrder: 2, enabled: true, revision: 1, presentation: {} },
    ],
    content: [],
    programs: [],
    news: [],
    schedules: [],
    runs: [
      run(
        '55555555-5555-4555-8555-555555555555',
        operationsId,
        'Mock Operations',
        2030,
        'failed',
        [{
          url: 'https://example.com/rejected-source',
          reason: 'The fetched page did not identify a publisher or publication date.',
        }],
      ),
      run('66666666-6666-4666-8666-666666666666', financeId, 'Mock Finance', 2050, 'published'),
    ],
    decisions: [],
    freshness: {
      status: 'current',
      oldestUpdatedAt: startedAt,
      overdueCount: 0,
      label: 'Current',
      href: '/future-of-work',
    },
  };

  let submitted: unknown;
  await page.route('**/api/editorial/future-work', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { data: adminData } });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/editorial/future-work/research', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      json: {
        data: {
          ...adminData.runs[0],
          id: '77777777-7777-4777-8777-777777777777',
          status: 'queued',
          processed: 0,
          results: [],
        },
      },
    });
  });

  await page.goto('/admin/research');
  await expect(page.getByRole('heading', { name: 'Future of Work Research' })).toBeVisible();
  await page.getByTestId(`checkbox-fn-${operationsId}`).click();
  await page.getByTestId('checkbox-cat-2050').click();
  await page.getByTestId('input-topic').fill('human-machine operating models');
  await page.getByTestId('button-research-targeted').click();
  await expect.poll(() => submitted).toEqual({
    functionIds: [operationsId],
    categories: ['2050'],
    topic: 'human-machine operating models',
  });

  await expect(page.getByText(/The fetched page did not identify a publisher or publication date\./)).toBeVisible();

  const functionFilter = page.getByRole('combobox', { name: 'History · function' });
  const categoryFilter = page.getByRole('combobox', { name: 'History · category' });
  await functionFilter.selectOption(financeId);
  await categoryFilter.selectOption('2050');
  await expect(page.getByTestId('run-card-66666666-6666-4666-8666-666666666666')).toBeVisible();
  await expect(page.getByTestId('run-card-55555555-5555-4555-8555-555555555555')).toHaveCount(0);
});

test('saved-source preflight isolates pending, retry and stale results from unsaved edits', async ({ page, staff }) => {
  await signInInvitedStaff(page, staff);
  const functionId = '77777777-7777-4777-8777-777777777777';
  const urls = ['https://www.weforum.org/stories/work', 'https://www.oecd.org/work'];
  let revision = 4;
  const record = () => ({
    id: functionId, slug: 'preflight-browser', name: 'Preflight Browser',
    description: 'Isolated browser fixture', sortOrder: 1, enabled: true,
    revision, presentation: {}, researchSources: { urls, instructions: 'Saved guidance' },
  });
  const requests: unknown[] = [];
  const unexpectedWrites: string[] = [];
  let releaseFirst!: () => void;
  const pending = new Promise<void>(resolve => { releaseFirst = resolve; });
  let firstAttempts = 0;
  let stale = false;
  // Real Clerk/staff authentication; deterministic source responses avoid external
  // publisher/network changes. Route integration tests exercise the actual handler.
  await page.route('**/api/editorial/future-work**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/source-preflight')) {
      const body = request.postDataJSON();
      requests.push(body);
      expect(request.method()).toBe('POST');
      expect(path).toBe(`/api/editorial/future-work/functions/${functionId}/source-preflight`);
      expect(Object.keys(body).sort()).toEqual(['revision', 'sourceIndex']);
      if (stale) {
        await route.fulfill({ status: 409, json: { error: 'Revision conflict' } });
      } else if (body.sourceIndex === 0 && ++firstAttempts === 1) {
        await pending;
        await route.fulfill({ status: 503, json: { error: 'Source temporarily unavailable' } });
      } else {
        await route.fulfill({ json: { data: {
          checkedAt: '2026-09-21T12:00:00.000Z',
          publisher: body.sourceIndex === 0 ? 'World Economic Forum' : 'OECD',
          finalUrl: urls[body.sourceIndex], finalPublisher: 'Recognized publisher',
          withinSavedSource: true, retrieval: 'retrieved', format: 'text/html',
          publicationDate: null, message: 'Saved page retrieved.',
          evidence: [{ category: 'news', eligible: false, reason: 'No publication date found.' }],
          disclaimer: 'Eligibility does not approve claims or publish findings.',
        } } });
      }
      return;
    }
    if (request.method() !== 'GET') {
      unexpectedWrites.push(`${request.method()} ${path}`);
      await route.fulfill({ status: 500, json: { error: 'Unexpected mutation during check' } });
      return;
    }
    await route.fulfill({ json: { data: {
      functions: [record()], content: [], programs: [], news: [],
      schedules: [], runs: [], decisions: [],
      freshness: { status: 'current', oldestUpdatedAt: null, overdueCount: 0, label: 'Current', href: '/future-of-work' },
    } } });
  });
  await page.goto('/admin/future-work');
  await page.getByTestId(`button-function-edit-${functionId}`).click();
  const section = page.getByRole('region', { name: 'Saved research source eligibility' });
  const buttons = section.getByRole('button');
  const results = section.getByTestId('source-preflight-result');
  await expect(buttons).toHaveCount(2);
  expect(requests).toEqual([]);
  await page.getByTestId('input-research-source-0').fill('https://unsaved.example/new');
  await page.getByTestId('input-research-source-instructions').fill('Unsaved guidance');
  await buttons.nth(0).click();
  await expect(buttons.nth(0)).toHaveText('Checking…');
  await expect(buttons.nth(0)).toBeDisabled();
  await expect(section.locator('[aria-busy="true"]')).toHaveCount(1);
  await expect(buttons.nth(1)).toBeEnabled();
  await buttons.nth(1).click();
  await expect(results).toHaveCount(1);
  await expect(results).toContainText('OECD');
  await expect(results).toContainText('Unavailable — not inferred');
  await expect(results).toContainText('news: Not eligible');
  releaseFirst();
  await expect(section.getByRole('alert')).toHaveText('Source temporarily unavailable');
  await expect(buttons.nth(0)).toBeEnabled();
  await buttons.nth(0).click();
  await expect(section.getByRole('alert')).toHaveCount(0);
  await expect(results).toHaveCount(2);
  await expect(results.nth(0)).toContainText(urls[0]);
  await expect(page.getByTestId('input-research-source-0')).toHaveValue('https://unsaved.example/new');
  expect(requests).toEqual([
    { revision: 4, sourceIndex: 0 }, { revision: 4, sourceIndex: 1 }, { revision: 4, sourceIndex: 0 },
  ]);

  // An edit in another session must reject the old revision, not reuse the
  // previous successful result. Reopening after reload uses the new revision.
  stale = true;
  revision = 5;
  await buttons.nth(0).click();
  await expect(section.getByRole('alert')).toHaveText(
    'This record changed in another session. Your unsaved edits are still here; the latest data has not been loaded. Copy any unsaved edits before reloading the page, then reopen this function and review the latest saved sources before checking again.',
  );
  await expect(page.getByTestId('input-research-source-0')).toHaveValue('https://unsaved.example/new');
  expect(requests.at(-1)).toEqual({ revision: 4, sourceIndex: 0 });
  await expect(results).toHaveCount(1);
  await page.reload();
  await page.getByTestId(`button-function-edit-${functionId}`).click();
  await expect(section.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('input-research-source-0')).toHaveValue(urls[0]);
  await expect(results).toHaveCount(0);
  stale = false;
  await buttons.nth(0).click();
  await expect(results).toHaveCount(1);
  expect(requests.at(-1)).toEqual({ revision: 5, sourceIndex: 0 });
  expect(unexpectedWrites).toEqual([]);
});

test('mocked CMS source edits persist across reload and the run snapshot is displayed', async ({ page, staff }) => {
  test.setTimeout(180_000);
  await signInInvitedStaff(page, staff);

  const functionId = '88888888-8888-4888-8888-888888888888';
  const startedAt = '2026-02-02T12:00:00.000Z';
  let researchSources: { urls: string[]; instructions: string } | null = null;
  let revision = 1;
  const functionRecord = () => ({
    id: functionId,
    slug: 'mock-source-guidance',
    name: 'Mock Source Guidance',
    description: 'A mocked function used only by this browser check.',
    sortOrder: 1,
    enabled: true,
    revision,
    presentation: {},
    researchSources,
  });
  const data = () => ({
    functions: [functionRecord()],
    content: [],
    programs: [],
    news: [],
    schedules: [],
    runs: [{
      id: '99999999-9999-4999-8999-999999999999',
      scheduleId: 'research',
      status: 'running',
      startedAt,
      processed: 0,
      sourcesFound: 0,
      sourcesAccepted: 0,
      sourcesRejected: 0,
      errors: [],
      plan: [{
        functionId,
        name: 'Mock Source Guidance',
        kind: 'news',
        researchSources,
      }],
      results: [],
    }],
    decisions: [],
    freshness: {
      status: 'current',
      oldestUpdatedAt: startedAt,
      overdueCount: 0,
      label: 'Current',
      href: '/future-of-work',
    },
  });

  await page.route(`**/api/editorial/future-work/functions/${functionId}`, async route => {
    expect(route.request().method()).toBe('PATCH');
    const body = route.request().postDataJSON();
    expect(body.revision).toBe(revision);
    researchSources = body.researchSources;
    revision += 1;
    await route.fulfill({ json: { data: functionRecord() } });
  });
  await page.route('**/api/editorial/future-work', async route => {
    await route.fulfill({ json: { data: data() } });
  });

  await page.goto('/admin/future-work');
  await page.getByTestId(`button-function-edit-${functionId}`).click();
  await page.getByTestId('button-add-research-source').click();
  await page.getByTestId('input-research-source-0').fill('https://example.org');
  await page.getByTestId('button-add-research-source').click();
  await page.getByTestId('input-research-source-1').fill('https://example.org/reports/future-work');
  await page.getByTestId('input-research-source-instructions').fill('Prioritize dated workforce reports.');
  await page.getByTestId('button-save-function').click();
  await expect.poll(() => researchSources).toEqual({
    urls: ['https://example.org', 'https://example.org/reports/future-work'],
    instructions: 'Prioritize dated workforce reports.',
  });

  await page.reload();
  await page.getByTestId(`button-function-edit-${functionId}`).click();
  await expect(page.getByTestId('input-research-source-1')).toHaveValue('https://example.org/reports/future-work');
  await page.getByTestId('input-research-source-1').fill('https://example.org/programs/leadership');
  await page.getByRole('button', { name: 'Remove source URL 1' }).click();
  await page.getByTestId('button-save-function').click();
  await expect.poll(() => researchSources).toEqual({
    urls: ['https://example.org/programs/leadership'],
    instructions: 'Prioritize dated workforce reports.',
  });

  await page.reload();
  await page.getByTestId(`button-function-edit-${functionId}`).click();
  await page.getByTestId('button-clear-research-sources').click();
  await page.getByTestId('button-save-function').click();
  await expect.poll(() => researchSources).toBeNull();

  researchSources = {
    urls: ['https://example.org/programs/leadership'],
    instructions: 'Snapshot retained when this run was planned.',
  };
  await page.goto('/admin/research');
  await expect(page.getByTestId('research-source-snapshot')).toContainText('https://example.org/programs/leadership');
  await expect(page.getByTestId('research-source-snapshot')).toContainText('Snapshot retained when this run was planned.');
  await expect(page.getByText(/Research is in progress.*recorded plan above/i)).toBeVisible();
});
