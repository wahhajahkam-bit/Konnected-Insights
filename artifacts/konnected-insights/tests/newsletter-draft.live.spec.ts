import { test as base, expect, type Page } from '@playwright/test';
import type { AiAutofillResponse, EditorialItem } from '../src/lib/api';
import { createNewsletterFixture } from './helpers/newsletter-live-fixture';

const test = base.extend<{ newsletter: Awaited<ReturnType<typeof createNewsletterFixture>> }>({
  newsletter: [async ({}, use) => {
    const fixture = await createNewsletterFixture();
    try {
      await use(fixture);
    } finally {
      // A separate fixture timeout gives cleanup its own budget after test timeout.
      await fixture.cleanup();
    }
  }, { timeout: 120_000 }],
});

// A separate project is only registered after explicit opt-in. This guard also
// protects anyone collecting the file using a different Playwright config.
test.skip(process.env.NEWSLETTER_LIVE_AI !== '1', 'Uses a real development identity and paid AI.');

/** Same-origin cookie auth, exactly like the UI; never forge claims or inject a bearer token. */
async function api(page: Page, path: string, method = 'GET', body?: unknown) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }, { path, method, body });
}

// Existing newsletter labels are visual labels, not all htmlFor-associated.
// Scope by exact label rather than field order or CSS presentation classes.
function field(page: Page, label: string) {
  return page.locator('label').filter({ hasText: new RegExp(`^${label}$`) })
    .locator('..').locator('input:not([type="file"]), textarea').first();
}

async function reopen(page: Page, title: string) {
  await page.reload();
  await expect(page.getByText('Secured Staff Session', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select Newsletters collection', exact: true }).click();
  await page.getByPlaceholder('Search...').fill(title);
  await page.getByRole('button').filter({ has: page.getByText(title, { exact: true }) }).click();
  await expect(page.locator('input[name="title"]')).toHaveValue(title);
}

test('real approved editor reviews AI, saves and edits a private newsletter; duplicate links are rejected', async ({ page, newsletter: fixture }) => {
  test.setTimeout(240_000);
    const slug = `newsletter-qa-${fixture.runId}`;
    const secondSlug = `${slug}-second`;
    const duplicateSlug = `${slug}-duplicate`;
    for (const value of [slug, secondSlug, duplicateSlug]) await fixture.trackSlug(value);
    const reference = `https://www.linkedin.com/pulse/${slug}/?utm_source=qa`;
    await fixture.trackReferenceUrl(reference);
    const duplicateUrl = `https://www.linkedin.com/pulse/${slug}/?utm_source=changed&utm_campaign=qa#review`;
    const secondUrl = `https://www.linkedin.com/pulse/${secondSlug}/`;
    const title = `Synthetic newsletter ${fixture.runId}`;
    const excerpt = 'Synthetic QA evidence about human review of AI-assisted work. Not a real publication.';
    const author = 'Synthetic Editorial Writer';
    const cover = '/editorial/generated/ai-professions.jpg';

    await test.step('Sign in as a real, unapproved development identity', async () => {
      await page.goto('/admin');
      await page.waitForFunction(() => Boolean((window as any).Clerk?.loaded));
      const ticket = await fixture.createSignInToken();
      // No storageState, logging, screenshot, or trace of this single-use ticket.
      const signedIn = await page.evaluate(async (ticket) => {
        try {
          const clerk = (window as any).Clerk;
          const attempt = await clerk.client.signIn.create({ strategy: 'ticket', ticket });
          if (attempt.status !== 'complete') return false;
          await clerk.setActive({ session: attempt.createdSessionId });
          return true;
        } catch {
          return false; // Avoid leaking SDK errors containing the ticket.
        }
      }, ticket);
      expect(signedIn, 'Clerk ticket sign-in completed').toBe(true);
      await page.goto('/admin');
      await expect(page.getByText('Access Restricted', { exact: true })).toBeVisible();
      const browserUserId = await page.evaluate(() => (window as any).Clerk.user?.id);
      expect(browserUserId).toBe(fixture.userId);
      const access = await api(page, '/editorial/access');
      expect(access.status).toBe(200);
      expect(access.body.data).toMatchObject({ allowed: false, role: null, canManageStaff: false });
      for (const [path, method, body] of [
        ['/editorial?collection=newsletters&includeDrafts=true', 'GET', undefined],
        ['/editorial', 'POST', {}],
        ['/editorial/generate', 'POST', {}],
      ] as const) {
        const denied = await api(page, path, method, body);
        expect(denied.status).toBe(403);
        expect(denied.body.error.code).toBe('STAFF_ACCESS_DENIED');
      }
    });

    await test.step('Approve the exact identity as editor, never admin', async () => {
      await fixture.approveEditor();
      await page.reload();
      await expect(page.getByText('Secured Staff Session', { exact: true })).toBeVisible();
      const access = await api(page, '/editorial/access');
      expect(access.status).toBe(200);
      expect(access.body.data).toMatchObject({
        allowed: true, role: 'editor', canManageStaff: false, email: fixture.email,
      });
      expect((await api(page, '/editorial?collection=newsletters&includeDrafts=true')).status).toBe(200);
      await expect(page.getByRole('button', { name: 'Manage Staff', exact: true })).toHaveCount(0);
      // Malformed writes avoid invitations or role changes even if the guard regresses.
      for (const [path, method, body] of [
        ['/editorial/staff', 'GET', undefined],
        ['/editorial/staff', 'POST', {}],
        [`/editorial/staff/${fixture.staffId}`, 'PATCH', {}],
        [`/editorial/staff/${fixture.staffId}`, 'DELETE', undefined],
      ] as const) {
        const denied = await api(page, path, method, body);
        expect(denied.status).toBe(403);
        expect(denied.body.error.code).toBe('ADMIN_ACCESS_DENIED');
      }
    });

    let generated: AiAutofillResponse;
    await test.step('Paste text and reference, then explicitly review and apply real AI output', async () => {
      await page.getByRole('button', { name: 'Select Newsletters collection', exact: true }).click();
      await page.getByRole('button', { name: 'Create newsletter draft', exact: true }).click();
      await page.getByRole('button', { name: 'Paste newsletter text (no API)', exact: true }).click();
      await page.locator('#ai-source-url').fill(reference);
      await page.locator('#ai-source-text').fill(
        `${title}\nBy ${author}\nCategory: Future of Work\n\n${excerpt}\n\n` +
        'A fictional team checks AI summaries against source notes before making decisions. ' +
        'Editors verify attribution, correct unsupported claims, and keep unpublished work in draft. ' +
        'This invented article is exclusively for an automated development test. No cover image is supplied.',
      );
      let generationRequests = 0;
      const countGeneration = (request: import('@playwright/test').Request) => {
        if (new URL(request.url()).pathname === '/api/editorial/generate' && request.method() === 'POST') generationRequests++;
      };
      page.on('request', countGeneration);
      const responsePromise = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/editorial/generate' && response.request().method() === 'POST',
        { timeout: 120_000 },
      );
      await page.getByRole('button', { name: 'Generate', exact: true }).click();
      const response = await responsePromise;
      expect(response.status(), 'Real AI must succeed; no mocked or fallback output').toBe(200);
      const request = response.request().postDataJSON();
      expect(request.sourceUrl).toBe(reference);
      expect(request.sourceText).toContain(fixture.runId);
      generated = (await response.json()).data;
      expect(generated.title.length).toBeGreaterThan(0);
      expect(generated.slug.length).toBeGreaterThan(0);
      expect(generated.data.url).toBe(reference);
      expect(generated.feedback.warnings.join(' ')).toContain('not been independently verified');
      await expect(page.getByText('Content Generated', { exact: true })).toBeVisible();
      await expect(page.getByText('This draft uses editor-supplied pasted text that has not been independently verified.', { exact: true })).toBeVisible();
      await expect(page.locator('input[name="title"]')).toHaveValue('');
      // Review is not a write: only the test's new identity can own this usage.
      const usage = await fixture.query('SELECT id FROM ai_generation_usage WHERE user_id = $1', [fixture.userId]);
      expect(usage.rowCount).toBe(1);
      const beforeApply = await api(page, '/editorial?collection=newsletters&includeDrafts=true');
      expect(beforeApply.status).toBe(200);
      expect(beforeApply.body.data.some((item: EditorialItem) => item.data.url === reference)).toBe(false);
      await page.getByRole('button', { name: 'Apply to Form', exact: true }).click();
      await expect(page.locator('input[name="title"]')).toHaveValue(generated.title);
      await expect(page.locator('input[name="slug"]')).toHaveValue(generated.slug);
      await expect(field(page, 'External URL')).toHaveValue(reference);
      if (generated.data.excerpt) await expect(field(page, 'Excerpt')).toHaveValue(generated.data.excerpt);
      await expect(page.locator('#create-status')).not.toBeChecked();
      const afterApply = await api(page, '/editorial?collection=newsletters&includeDrafts=true');
      expect(afterApply.status).toBe(200);
      expect(afterApply.body.data.some((item: EditorialItem) => item.data.url === reference)).toBe(false);
      expect(generationRequests).toBe(1);
      page.off('request', countGeneration);
    });

    let saved: EditorialItem;
    await test.step('Complete required fields and save a real draft', async () => {
      await page.locator('input[name="title"]').fill(title);
      await page.locator('input[name="slug"]').fill(slug);
      await field(page, 'Category').fill('Future of Work');
      await field(page, 'Excerpt').fill(excerpt);
      await field(page, 'Author Name').fill(author);
      const coverSection = page.locator('label').filter({ hasText: /^Cover Image/ }).locator('..');
      await coverSection.getByRole('button').click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Select Asset', { exact: true })).toBeVisible();
      await dialog.locator(`img[src="${cover}"]`).click();
      await expect(field(page, 'Cover Image')).toHaveValue(cover);
      const responsePromise = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/editorial' && response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(201);
      saved = (await response.json()).data;
      expect(saved).toMatchObject({ title, slug, status: 'draft', version: 1 });
      expect(saved.data).toMatchObject({ url: reference, excerpt, category: 'Future of Work', image: cover, author: { name: author } });
      const row = await fixture.query('SELECT status, version, data FROM editorial_items WHERE id = $1', [saved.id]);
      expect(row.rows[0]).toMatchObject({ status: 'draft', version: 1, data: saved.data });
      await reopen(page, title);
      await expect(field(page, 'External URL')).toHaveValue(reference);
      await expect(field(page, 'Excerpt')).toHaveValue(excerpt);
      await expect(field(page, 'Author Name')).toHaveValue(author);
      await expect(field(page, 'Cover Image')).toHaveValue(cover);
      // Existing drafts expose a Publish action instead of the create-only switch.
      await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible();
    });

    await test.step('An unchanged URL edit saves and survives reload', async () => {
      const editedTitle = `${title} edited`;
      const editedExcerpt = `${excerpt} Reviewed again.`;
      await page.locator('input[name="title"]').fill(editedTitle);
      await field(page, 'Excerpt').fill(editedExcerpt);
      const responsePromise = page.waitForResponse(
        (response) => new URL(response.url()).pathname === `/api/editorial/${saved.id}` && response.request().method() === 'PATCH',
      );
      await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      saved = (await response.json()).data;
      expect(saved).toMatchObject({ title: editedTitle, version: 2, status: 'draft' });
      expect(saved.data).toMatchObject({ url: reference, excerpt: editedExcerpt });
      await reopen(page, editedTitle);
      await expect(field(page, 'External URL')).toHaveValue(reference);
      await expect(field(page, 'Excerpt')).toHaveValue(editedExcerpt);
    });

    await test.step('Tracking-equivalent POST and PATCH return 409 without changing data', async () => {
      const payload = { collection: 'newsletters', title: `${title} second`, slug: secondSlug, status: 'draft', data: { ...saved.data, url: secondUrl } };
      const second = await api(page, '/editorial', 'POST', payload);
      expect(second.status).toBe(201);
      const duplicate = await api(page, '/editorial', 'POST', {
        ...payload, slug: duplicateSlug, data: { ...saved.data, url: duplicateUrl },
      });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('DUPLICATE_NEWSLETTER_URL');
      const duplicatePatch = await api(page, `/editorial/${second.body.data.id}`, 'PATCH', {
        expectedVersion: second.body.data.version, data: { ...second.body.data.data, url: duplicateUrl },
      });
      expect(duplicatePatch.status).toBe(409);
      expect(duplicatePatch.body.error.code).toBe('DUPLICATE_NEWSLETTER_URL');
      const unchanged = await fixture.query('SELECT version, data FROM editorial_items WHERE id = $1', [second.body.data.id]);
      expect(unchanged.rows[0]).toEqual({ version: 1, data: second.body.data.data });
      expect((await fixture.query('SELECT id FROM editorial_items WHERE collection = $1 AND slug = $2', ['newsletters', duplicateSlug])).rowCount).toBe(0);
      const ownUrl = await api(page, `/editorial/${second.body.data.id}`, 'PATCH', {
        expectedVersion: 1, data: { ...second.body.data.data, url: `${secondUrl}?utm_source=self#edit` },
      });
      expect(ownUrl.status).toBe(200);
      expect(ownUrl.body.data.version).toBe(2);
      const publicRead = await api(page, '/editorial?collection=newsletters');
      expect(publicRead.status).toBe(200);
      expect(publicRead.body.data.some((item: EditorialItem) => [saved.id, second.body.data.id].includes(item.id))).toBe(false);
    });
});