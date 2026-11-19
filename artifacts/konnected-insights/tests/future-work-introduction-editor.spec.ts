import { expect, test, type Locator } from '@playwright/test';
import type { FwFunction } from '../src/lib/api-future-work';

// Authenticated-state UI regression, not an OAuth/backend authorization test.
// Keep the real access hook, admin route, form, preview and public renderer.
// All API traffic is intercepted at context level, including unexpected writes.
const fixture: FwFunction = {
  id: 'introduction-preview-fixture',
  name: 'Fixture planning',
  slug: 'fixture-planning',
  description: 'Saved description.',
  enabled: true,
  sortOrder: 1,
  revision: 1,
  presentation: {
    shortIntroduction: 'Saved short introduction.',
    sectionIntroductions: { overview: 'Saved overview.' },
  },
};
const generic = (name: string) =>
  `For ${name}, the focus is on how people, tools and working practices support its responsibilities and decisions.`;
const finance = 'For finance teams, the central questions concern capital allocation, financial controls and the judgement needed to turn data into decisions.';

// Check rendered geometry, not CSS class names: overflow-hidden must not be
// allowed to make clipped text look like a passing no-scrollbar regression.
async function expectReadable(container: Locator, paragraphs: Locator) {
  const bounds = await container.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left, right: rect.right, viewport: window.innerWidth,
      client: element.clientWidth, scroll: element.scrollWidth,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(-1);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewport + 1);
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.client + 1);
  for (const paragraph of await paragraphs.all()) {
    const layout = await paragraph.evaluate(element => {
      const box = element.getBoundingClientRect();
      // pre-wrap can hang trailing spaces outside the line box. Measure
      // visible words, not those invisible spaces, without ignoring glyphs.
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const lines: DOMRect[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        for (const match of (node.textContent ?? '').matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index!);
          range.setEnd(node, match.index! + match[0].length);
          lines.push(...Array.from(range.getClientRects()));
        }
      }
      return {
        text: element.textContent,
        whitespace: getComputedStyle(element).whiteSpace,
        width: element.clientWidth, scrollWidth: element.scrollWidth,
        height: element.clientHeight, scrollHeight: element.scrollHeight,
        left: box.left, right: box.right,
        // A line's glyph box can be slightly taller than its CSS line box.
        contained: lines.every(line => line.left >= box.left - 1 &&
          line.right <= box.right + 1 && line.top >= box.top - 1 &&
          line.bottom <= box.bottom + 1),
        lineCount: new Set(lines.map(line => line.top)).size,
      };
    });
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.left).toBeGreaterThanOrEqual(bounds.left - 1);
    expect(layout.right).toBeLessThanOrEqual(bounds.right + 1);
    expect(layout.scrollWidth, layout.text ?? '').toBeLessThanOrEqual(layout.width + 1);
    expect(layout.scrollHeight, layout.text ?? '').toBeLessThanOrEqual(layout.height + 1);
    expect(layout.contained, JSON.stringify(layout)).toBe(true);
    expect(layout.whitespace).toBe('pre-wrap');
    expect(layout.lineCount).toBeGreaterThan(1);
  }
}

for (const { mode, width } of (['edit', 'create'] as const).flatMap(mode =>
  [null, 320, 390].map(width => ({ mode, width })))) {
  test(`${mode}: ${width ? `${width}px long introduction stays readable` : 'unsaved introduction preview matches public paragraphs'}`, async ({ context, page }) => {
    test.setTimeout(90_000);
    if (width) await page.setViewportSize({ width, height: 844 });
    const writes: string[] = [];
    let accessRequests = 0;
    let publicFixture = structuredClone(fixture);
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
      if (!['GET', 'HEAD'].includes(request.method())) {
        writes.push(`${request.method()} ${path}`);
        return route.fulfill({ status: 405, json: { error: 'Fixture forbids writes' } });
      }
      if (path === '/api/editorial/access') {
        accessRequests++;
        return route.fulfill({ json: { data: { allowed: true, role: 'editor', canManageStaff: false } } });
      }
      if (path === '/api/editorial/future-work') {
        return route.fulfill({ json: { data: {
          functions: [fixture], content: [], news: [], programs: [], runs: [], schedules: [],
          decisions: [], freshness: { overdueCount: 0 },
        } } });
      }
      if (path === `/api/future-work/functions/${publicFixture.slug}`) {
        return route.fulfill({ json: { data: {
          function: publicFixture, content: [], programs: [], news: [], skills: [],
        } } });
      }
      return route.fulfill({ status: 404, json: { error: 'No fixture for this endpoint' } });
    });

    await page.goto('/admin/future-work');
    const open = () => mode === 'edit'
      ? page.getByTestId(`button-function-edit-${fixture.id}`).click()
      : page.getByTestId('button-add-function').click();
    await open();
    expect(accessRequests).toBeGreaterThan(0);
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Section introductions', { exact: true }).click();
    const preview = dialog.getByTestId('function-header-preview');
    // Select only the display paragraphs, excluding labels and explanatory copy.
    const paragraphs = preview.locator('p.whitespace-pre-wrap');
    const publishedPage = await context.newPage();
    if (width) await publishedPage.setViewportSize({ width, height: 844 });
    const draft = structuredClone(mode === 'edit' ? fixture : {
      ...fixture, name: '', slug: '', description: '', presentation: {
        shortIntroduction: '', sectionIntroductions: { overview: '' },
      },
    });
    async function compare(expected: string[], checkPublic = false) {
      await expect(paragraphs).toHaveText(expected);
      await expect(preview.locator('input, textarea, [contenteditable="true"]')).toHaveCount(0);
      expect(writes).toEqual([]);
      // Check every draft transition immediately, but load the full public app
      // only for representative explicit, blank, slug and duplicate states.
      // Repeated full-app reloads for every keystroke state are slow in CI.
      if (!checkPublic) return;
      // Public fixture is made from independently tracked form inputs, never
      // from preview output or the shared copy helper (which could hide a bug).
      publicFixture = structuredClone(draft);
      // Blank slug has no public route; use an unknown fixture-only identifier.
      publicFixture.slug ||= 'blank-slug-fixture';
      await publishedPage.goto(`/future-of-work/${publicFixture.slug}`, { waitUntil: 'domcontentloaded' });
      await expect(publishedPage.locator('#overview > p')).toHaveText(expected, { timeout: 15_000 });
      expect(await publishedPage.locator('#overview > p').allTextContents())
        .toEqual(await paragraphs.allTextContents());
      expect(writes).toEqual([]);
    }
    async function fill(label: string, value: string) {
      await dialog.getByLabel(label, { exact: true }).fill(value);
      if (label === 'Short introduction') draft.presentation!.shortIntroduction = value;
      else if (label === 'Overview') draft.presentation!.sectionIntroductions!.overview = value;
      else if (label === 'Description') draft.description = value;
      else if (label === 'Name') draft.name = value;
      else if (label === 'Slug') draft.slug = value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }

    if (width) {
      // Distinct sentences avoid duplicate suppression; expected copy comes
      // directly from inputs, not the shared introduction helper.
      const longParagraph = 'Teams are reconsidering how responsibilities are shared across a changing organisation, with careful attention to the decisions that still require human judgement and the support people need to work confidently with unfamiliar tools. Planning also includes practical training, clear ownership and time to understand how these changes affect everyday work.';
      const unbrokenWord = 'UnbrokenResearchIdentifier'.repeat(10);
      // Keep newlines within a sentence: sentence-boundary whitespace is
      // intentionally normalized by the existing copy suppression helper.
      const multiline = `First line explains the operating context\nSecond line keeps an intentional line break\n\n${unbrokenWord}\nFinal line must remain fully readable.`;
      await fill('Name', 'Narrow planning');
      await fill('Slug', 'narrow-planning');
      await fill('Short introduction', longParagraph);
      await fill('Overview', multiline);
      await compare([longParagraph, multiline], true);
      // toHaveText normalizes whitespace; raw contents also protect newlines.
      expect(await paragraphs.allTextContents()).toEqual([longParagraph, multiline]);
      await expectReadable(dialog, paragraphs);
      await expectReadable(preview, paragraphs);
      await expectReadable(publishedPage.locator('#overview'), publishedPage.locator('#overview > p'));
      expect(await publishedPage.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width + 1);
      // The tall preview may scroll vertically, but its last line and Cancel
      // must remain reachable inside the real dialog.
      await paragraphs.last().evaluate(element => {
        element.scrollIntoView({ block: 'end' });
      });
      const lastLine = await paragraphs.last().evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const last = Array.from(range.getClientRects()).at(-1)!;
        const dialog = element.closest('[role="dialog"]')!.getBoundingClientRect();
        return { top: last.top, bottom: last.bottom, dialogTop: dialog.top, dialogBottom: dialog.bottom };
      });
      expect(lastLine.top).toBeGreaterThanOrEqual(lastLine.dialogTop);
      expect(lastLine.bottom).toBeLessThanOrEqual(lastLine.dialogBottom + 1);
      await expect(dialog.getByLabel('Short introduction', { exact: true })).toHaveValue(longParagraph);
      await expect(dialog.getByLabel('Overview', { exact: true })).toHaveValue(multiline);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(writes).toEqual([]);
      await publishedPage.close();
      return;
    }

    await compare(mode === 'edit'
      ? ['Saved short introduction.', 'Saved overview.']
      : [generic('this business function')], true);
    await fill('Short introduction', 'New short introduction.');
    await compare(['New short introduction.', mode === 'edit' ? 'Saved overview.' : generic('this business function')]);
    await fill('Overview', 'New overview.');
    await compare(['New short introduction.', 'New overview.'], true);
    await fill('Description', 'New description.');
    await compare(['New short introduction.', 'New overview.']); // Overview wins.
    await fill('Overview', '   ');
    await compare(['New short introduction.', 'New description.']);
    await fill('Description', 'Changed description.');
    await compare(['New short introduction.', 'Changed description.']);
    await fill('Short introduction', '   ');
    await compare(['Changed description.']);
    await fill('Description', '   ');
    await compare([generic(draft.name || 'this business function')]);
    await fill('Name', 'Renamed planning');
    await compare([generic('Renamed planning')]);
    await fill('Slug', 'FINANCE');
    await expect(dialog.getByLabel('Slug', { exact: true })).toHaveValue('finance');
    await compare([finance], true);
    await fill('Slug', 'custom-planning');
    await compare([generic('Renamed planning')]);
    await fill('Name', '   ');
    await compare([generic('this business function')]);
    await fill('Short introduction', 'Shared sentence. Shared sentence.');
    await compare(['Shared sentence.', generic('this business function')]);
    await fill('Overview', 'shared sentence. Distinct overview.');
    await compare(['Shared sentence.', 'Distinct overview.']);
    await fill('Description', 'Shared sentence. Distinct description.');
    await fill('Overview', 'SHARED SENTENCE.');
    await compare(['Shared sentence.', 'Distinct description.'], true);
    await fill('Description', 'shared sentence.');
    await compare(['Shared sentence.', generic('this business function')]);
    // Display-only suppression must not rewrite the user's draft fields.
    await expect(dialog.getByLabel('Short introduction', { exact: true })).toHaveValue('Shared sentence. Shared sentence.');
    await expect(dialog.getByLabel('Overview', { exact: true })).toHaveValue('SHARED SENTENCE.');
    await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('shared sentence.');
    await fill('Short introduction', 'Choose a time horizon to read the available published research.');
    await fill('Overview', '');
    await fill('Description', '');
    await compare([generic('this business function')]);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    await open();
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(mode === 'edit' ? fixture.name : '');
    await expect(dialog.getByLabel('Short introduction', { exact: true }))
      .toHaveValue(mode === 'edit' ? fixture.presentation!.shortIntroduction! : '');
    expect(writes).toEqual([]);
    await publishedPage.close();
  });
}