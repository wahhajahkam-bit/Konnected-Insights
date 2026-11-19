import { expect, test, type Locator } from '@playwright/test';
import type { FwFunction } from '../src/lib/api-future-work';

const savedUrl = `https://www.weforum.org/stories/2026/09/${'long-research-source-'.repeat(12)}workforce`;
const finalUrl = `${savedUrl}?reference=${'redirected-report-'.repeat(12)}`;
const instructions = 'Look for dated, attributable research about workforce planning and distinguish forecasts from observed changes. '.repeat(8);
const fixture: FwFunction = {
  id: 'mobile-source-fixture', name: 'Fixture planning', slug: 'fixture-planning',
  description: 'Saved description.', enabled: true, sortOrder: 1, revision: 7,
  researchSources: { urls: [savedUrl], instructions },
};
const result = {
  checkedAt: '2026-09-21T12:00:00.000Z',
  publisher: 'World Economic Forum', finalPublisher: 'World Economic Forum',
  finalUrl, withinSavedSource: true, retrieval: 'retrieved', format: 'html',
  publicationDate: '2026-09-01',
  message: 'The public article was retrieved successfully. Its publication date and publisher can be evaluated, but its claims still require independent editorial review.',
  evidence: [
    { category: 'current', eligible: true, reason: 'This dated article meets source eligibility rules; relevance and claim support still need review before publication.' },
    { category: 'ten_year', eligible: false, reason: 'The article does not establish a ten-year forecast with a sufficiently explicit timeframe and attributable evidence.' },
  ],
  disclaimer: 'These checks evaluate the saved source only. They do not approve claims, publish findings, start research, or enable schedules.',
};

// Glyph bounds catch clipped copy even if overflow is hidden. Inputs deliberately
// scroll internally; rendered saved/final URLs and result prose must wrap instead.
async function expectWrapped(dialog: Locator, text: Locator) {
  const bounds = await dialog.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, viewport: innerWidth,
      client: element.clientWidth, scroll: element.scrollWidth };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.client + 1);
  for (const element of await text.all()) {
    const layout = await element.evaluate(element => {
      const box = element.getBoundingClientRect();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const fragments: DOMRect[] = [];
      while (walker.nextNode()) {
        for (const word of (walker.currentNode.textContent ?? '').matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(walker.currentNode, word.index!);
          range.setEnd(walker.currentNode, word.index! + word[0].length);
          fragments.push(...range.getClientRects());
        }
      }
      return { text: element.textContent, left: box.left, right: box.right,
        width: element.clientWidth, scroll: element.scrollWidth,
        height: element.clientHeight, scrollHeight: element.scrollHeight,
        lines: new Set(fragments.map(rect => rect.top)).size,
        contained: fragments.every(rect => rect.left >= box.left - 1 &&
          rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1) };
    });
    expect(layout.left).toBeGreaterThanOrEqual(bounds.left);
    expect(layout.right).toBeLessThanOrEqual(bounds.right);
    expect(layout.scroll, layout.text ?? '').toBeLessThanOrEqual(layout.width + 1);
    expect(layout.scrollHeight, layout.text ?? '').toBeLessThanOrEqual(layout.height + 1);
    expect(layout.contained, JSON.stringify(layout)).toBe(true);
    expect(layout.lines, layout.text ?? '').toBeGreaterThan(1);
  }
}

async function expectReachable(control: Locator) {
  // Center explicitly: nearest scrolling can leave a fractional pixel behind
  // the dialog edge, despite Playwright considering the element in view.
  await control.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await expect(control).toBeInViewport({ ratio: 1 });
  await expect(control).toBeEnabled();
  // Trial click also checks occlusion and actionability without changing state.
  await control.click({ trial: true });
}

for (const width of [320, 390]) {
  test(`${width}px research fields and saved-source outcomes wrap with reachable retries`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 844 });
    const unexpected: string[] = [];
    const checks: unknown[] = [];
    // Same authenticated-state seam as the introduction editor regression.
    // Keep the real access hook and dialog; this is not an OAuth test.
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
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === 'POST' && path === `/api/editorial/future-work/functions/${fixture.id}/source-preflight`) {
        checks.push(request.postDataJSON());
        return checks.length === 2
          ? route.fulfill({ status: 503, json: { error: 'Source checks are temporarily unavailable. Your saved source and unsaved instructions have not changed. Please try again.' } })
          : route.fulfill({ json: { data: result } });
      }
      if (request.method() === 'GET' && path === '/api/editorial/access') {
        return route.fulfill({ json: { data: { allowed: true, role: 'editor', canManageStaff: false } } });
      }
      if (request.method() === 'GET' && path === '/api/editorial/future-work') {
        return route.fulfill({ json: { data: {
          functions: [fixture], content: [], news: [], programs: [], runs: [],
          schedules: [], decisions: [], freshness: { overdueCount: 0 },
        } } });
      }
      unexpected.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 405, json: { error: 'No fixture; real API requests forbidden' } });
    });
    await page.goto('/admin/future-work');
    await page.getByTestId(`button-function-edit-${fixture.id}`).click();
    const dialog = page.getByRole('dialog');
    const fields = dialog.getByTestId('research-sources-fields');
    const source = fields.getByLabel('Source URL 1', { exact: true });
    const guidance = fields.getByLabel('Research instructions', { exact: true });
    await expect(source).toHaveValue(savedUrl);
    await expect(guidance).toHaveValue(instructions);
    await expectReachable(source);
    const draftUrl = `${savedUrl}-unsaved`;
    await source.fill(draftUrl);
    await expectReachable(guidance);
    await guidance.fill(`${instructions}\nUnsaved guidance remains local.`);
    await expectWrapped(dialog, fields.locator('p').filter({ hasText: /Add a publisher/ }));
    for (const name of ['Remove source URL 1', 'Add source URL', 'Clear sources and instructions']) {
      await expectReachable(fields.getByRole('button', { name, exact: true }));
    }
    const preflight = dialog.getByRole('region', { name: 'Saved research source eligibility' });
    await expectWrapped(dialog, preflight.locator('span').filter({ hasText: savedUrl }));
    const check = preflight.getByRole('button', { name: 'Check eligibility', exact: true });
    await expectReachable(check);
    await check.click();
    const outcomes = preflight.getByTestId('source-preflight-result');
    await expect(outcomes).toContainText(result.disclaimer);
    await expect(outcomes).toContainText(`Final URL: ${finalUrl}`);
    await expect(outcomes).toContainText('current: Source checks passed');
    await expect(outcomes).toContainText('ten_year: Not eligible');
    await expectWrapped(dialog, outcomes.locator('p').filter({ hasText: /Final URL:|Safe retrieval:|current:|ten_year:|These checks/ }));
    const lastOutcome = outcomes.getByText(result.disclaimer, { exact: true });
    await lastOutcome.scrollIntoViewIfNeeded();
    await expect(lastOutcome).toBeInViewport({ ratio: 1 });
    await expectReachable(check);
    await check.click();
    const error = preflight.getByRole('alert');
    await expect(error).toContainText('Source checks are temporarily unavailable');
    await expect(outcomes).toHaveCount(0);
    await expectWrapped(dialog, error);
    await expectReachable(check);
    await check.click();
    await expect(outcomes).toContainText(result.disclaimer);
    await expect(error).toHaveCount(0);
    await expect(source).toHaveValue(draftUrl);
    await expect(guidance).toHaveValue(`${instructions}\nUnsaved guidance remains local.`);
    expect(checks).toEqual(Array.from({ length: 3 }, () => ({ revision: 7, sourceIndex: 0 })));
    await expectReachable(dialog.getByRole('button', { name: 'Cancel', exact: true }));
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(unexpected).toEqual([]);
  });
}