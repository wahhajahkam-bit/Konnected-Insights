import { expect, test } from '@playwright/test';
import type { FwFunction } from '../src/lib/api-future-work';

test('saved-source checks isolate pending, retry and conflicts without losing unsaved edits', async ({ page, context }) => {
  const urls = ['https://www.weforum.org/stories/work', 'https://www.oecd.org/work'];
  let revision = 4;
  const record = (): FwFunction => ({
    id: 'isolated-source-conflicts', slug: 'isolated-source-conflicts',
    name: 'Source check fixture', description: 'Saved description',
    sortOrder: 1, enabled: true, revision,
    researchSources: { urls, instructions: 'Saved guidance' },
  });
  const requests: unknown[] = [];
  const unexpected: string[] = [];
  let reads = 0;
  let releaseFirst!: () => void;
  const pending = new Promise<void>(resolve => { releaseFirst = resolve; });
  let firstAttempts = 0;
  let stale = false;

  // Same intercepted identity/access seam as future-work-source-mobile.spec.ts.
  // Exercise the real access hook and editor without OAuth or database fixtures.
  await context.route('**/node_modules/.vite/deps/@clerk_react.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      import React from '/node_modules/.vite/deps/react.js';
      export const useUser = () => ({ user: { id: 'preview-editor', primaryEmailAddress: { emailAddress: 'editor@example.test' } } });
      export const useAuth = () => ({ isSignedIn: true, userId: 'preview-editor' });
      export const useClerk = () => ({ signOut() {}, addListener() { return () => {}; } });
      export const ClerkProvider = ({ children }) => React.createElement(React.Fragment, null, children);
      export const Show = ({ children, when }) => when === 'signed-in' ? React.createElement(React.Fragment, null, children) : null;
      export const UserButton = () => null;
      export const SignIn = () => null;
      export const SignUp = () => null;
    `,
  }));
  // Fail closed for every API endpoint, including unexpected writes and reads.
  await context.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path === '/api/editorial/access') {
      return route.fulfill({ json: { data: { allowed: true, role: 'editor', canManageStaff: false } } });
    }
    if (request.method() === 'GET' && path === '/api/editorial/future-work') {
      reads++;
      return route.fulfill({ json: { data: {
        functions: [record()], content: [], news: [], programs: [], runs: [],
        schedules: [], decisions: [], freshness: { overdueCount: 0 },
      } } });
    }
    if (request.method() === 'POST' &&
      path === `/api/editorial/future-work/functions/${record().id}/source-preflight`) {
      const body = request.postDataJSON();
      requests.push(body);
      if (stale) {
        return route.fulfill({ status: 409, json: { error: 'Revision conflict' } });
      }
      if (body.sourceIndex === 0 && ++firstAttempts === 1) {
        await pending;
        return route.fulfill({ status: 503, json: { error: 'Source temporarily unavailable' } });
      }
      return route.fulfill({ json: { data: {
        checkedAt: '2026-09-21T12:00:00.000Z',
        publisher: body.sourceIndex === 0 ? 'World Economic Forum' : 'OECD',
        finalUrl: urls[body.sourceIndex], finalPublisher: 'Recognized publisher',
        withinSavedSource: true, retrieval: 'retrieved', format: 'text/html',
        publicationDate: null, message: 'Saved page retrieved.',
        evidence: [{ category: 'news', eligible: false, reason: 'No publication date found.' }],
        disclaimer: 'Eligibility does not approve claims or publish findings.',
      } } });
    }
    unexpected.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 405, json: { error: 'No fixture; real API requests forbidden' } });
  });

  try {
    await page.goto('/admin/future-work');
    await page.getByTestId(`button-function-edit-${record().id}`).click();
    const dialog = page.getByRole('dialog');
    const section = dialog.getByRole('region', { name: 'Saved research source eligibility' });
    const buttons = section.getByRole('button');
    const results = section.getByTestId('source-preflight-result');
    const source = dialog.getByTestId('input-research-source-0');
    const instructions = dialog.getByTestId('input-research-source-instructions');
    const expectDraft = async () => {
      await expect(source).toHaveValue('https://unsaved.example/new');
      await expect(instructions).toHaveValue('Unsaved guidance');
    };
    await expect(buttons).toHaveCount(2);
    expect(requests).toEqual([]);
    await source.fill('https://unsaved.example/new');
    await instructions.fill('Unsaved guidance');
    const initialReads = reads;

    await buttons.nth(0).click();
    await expect(buttons.nth(0)).toHaveText('Checking…');
    await expect(buttons.nth(0)).toBeDisabled();
    await expect(section.locator('[aria-busy="true"]')).toHaveCount(1);
    await expect(buttons.nth(1)).toBeEnabled();
    await expectDraft();
    await buttons.nth(1).click();
    await expect(results).toHaveCount(1);
    await expect(results).toContainText('OECD');
    await expect(results).toContainText(urls[1]);
    await expect(results).toContainText('Unavailable — not inferred');
    await expect(results).toContainText('news: Not eligible');
    // Source two finishes independently; source one is still genuinely pending.
    await expect(buttons.nth(1)).toBeEnabled();
    await expect(buttons.nth(0)).toBeDisabled();
    await expect(section.locator('[aria-busy="true"]')).toHaveCount(1);

    releaseFirst();
    await expect(section.getByRole('alert')).toHaveText('Source temporarily unavailable');
    await expect(buttons.nth(0)).toBeEnabled();
    await expect(section.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(results).toContainText('OECD');
    await expectDraft();
    await buttons.nth(0).click();
    await expect(section.getByRole('alert')).toHaveCount(0);
    await expect(results).toHaveCount(2);
    await expect(results.nth(0)).toContainText(urls[0]);
    await expect(results.nth(1)).toContainText(urls[1]);
    await expectDraft();
    expect(requests).toEqual([
      { revision: 4, sourceIndex: 0 }, { revision: 4, sourceIndex: 1 },
      { revision: 4, sourceIndex: 0 },
    ]);

    stale = true;
    revision = 5;
    await buttons.nth(0).click();
    await expect(section.getByRole('alert')).toHaveText(
      'This record changed in another session. Your unsaved edits are still here; the latest data has not been loaded. Copy any unsaved edits before reloading the page, then reopen this function and review the latest saved sources before checking again.',
    );
    await expectDraft();
    await expect(results).toHaveCount(1);
    await expect(results).toContainText('OECD');
    await expect(results).toContainText(urls[1]);
    await expect(buttons.nth(0)).toBeEnabled();
    await expect(buttons.nth(1)).toBeEnabled();
    await expect(section.locator('[aria-busy="true"]')).toHaveCount(0);
    expect(requests.at(-1)).toEqual({ revision: 4, sourceIndex: 0 });
    expect(reads).toBe(initialReads);

    // Only an explicit reload discards the draft and loads the new revision.
    await page.reload();
    await page.getByTestId(`button-function-edit-${record().id}`).click();
    await expect(section.getByRole('alert')).toHaveCount(0);
    await expect(results).toHaveCount(0);
    await expect(source).toHaveValue(urls[0]);
    await expect(instructions).toHaveValue('Saved guidance');
    stale = false;
    await buttons.nth(0).click();
    await expect(results).toHaveCount(1);
    expect(requests).toEqual([
      { revision: 4, sourceIndex: 0 }, { revision: 4, sourceIndex: 1 },
      { revision: 4, sourceIndex: 0 }, { revision: 4, sourceIndex: 0 },
      { revision: 5, sourceIndex: 0 },
    ]);
    expect(unexpected).toEqual([]);
  } finally {
    releaseFirst();
  }
});