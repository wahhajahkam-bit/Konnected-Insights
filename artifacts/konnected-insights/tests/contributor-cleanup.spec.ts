import { expect, test, type Page } from '@playwright/test';

const item = (slug: string, name: string, data: Record<string, unknown>) => ({
  id: `contributor-${slug}`,
  collection: 'contributors',
  slug,
  title: name,
  status: 'published',
  sortOrder: 0,
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  data: { name, role: 'Contributor', group: 'Contributors', ...data },
});

const contributors = [
  item('missing-cover', 'Missing Cover', {
    image: '/contributors/savi.svg',
    isPlaceholder: true,
    linkedinUrl: 'https://www.linkedin.com/in/missing-cover',
    contributions: [{ title: 'Card-hidden contribution', url: 'https://example.com/hidden' }],
  }),
  item('broken-cover', 'Broken Cover', {
    image: '/contributors/vivaan.svg',
    coverImage: '/test-assets/broken-cover.jpg',
    linkedinUrl: 'https://example.com/not-linkedin',
  }),
  item('varun-malik', 'Not Varun Malik', {
    image: '/contributors/savi.svg',
    coverImage: '/test-assets/usable-cover.svg',
  }),
];

async function mockContributorList(page: Page) {
  await page.route('**/api/editorial?collection=contributors', route =>
    route.fulfill({ json: { data: contributors } }));
  await page.route('**/test-assets/broken-cover.jpg', route =>
    route.fulfill({ status: 404, body: '' }));
  await page.route('**/test-assets/usable-cover.svg', route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#765b9b"/></svg>',
    }));
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`contributor cards omit unavailable covers and card contributions on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockContributorList(page);
    await page.goto('/contributors');

    await expect(page.locator('main h3')).toHaveCount(3);
    await expect(page.getByText('Card-hidden contribution')).toHaveCount(0);
    await expect(page.getByText('No cover photo')).toHaveCount(0);
    await expect(page.getByTestId('cover-photo')).toHaveCount(1);
    await expect(page.locator('main img[alt="Missing Cover"]')).toHaveCount(1);
    await expect(page.locator('main img[alt="Broken Cover"]')).toHaveCount(1);
    await expect(page.locator('main img[alt="Not Varun Malik"]')).toHaveCount(1);

    await expect(page.getByRole('link', { name: 'Missing Cover on LinkedIn' }))
      .toHaveAttribute('href', 'https://www.linkedin.com/in/missing-cover');
    await expect(page.getByText('No LinkedIn link', { exact: true })).toHaveCount(2);
    await expect(page.locator('main a[aria-label$=" on LinkedIn"]')).toHaveCount(1);
  });

  test(`contributor details retain portraits and contributions without unavailable covers on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/editorial/contributors/missing-cover', route =>
      route.fulfill({ json: { data: contributors[0] } }));
    await page.goto('/contributors/missing-cover');

    await expect(page.getByTestId('cover-photo')).toHaveCount(0);
    await expect(page.locator('img[alt="Missing Cover"]')).toHaveCount(1);
    await expect(page.getByText('Card-hidden contribution', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View contribution' }))
      .toHaveAttribute('href', 'https://example.com/hidden');
    await expect(page.getByRole('link', { name: /View LinkedIn profile/ }))
      .toHaveAttribute('href', 'https://www.linkedin.com/in/missing-cover');

    await page.route('**/api/editorial/contributors/broken-cover', route =>
      route.fulfill({ json: { data: contributors[1] } }));
    await page.route('**/test-assets/broken-cover.jpg', route =>
      route.fulfill({ status: 404, body: '' }));
    await page.goto('/contributors/broken-cover');
    await expect(page.getByTestId('cover-photo')).toHaveCount(0);
    await expect(page.getByText('No LinkedIn link', { exact: true })).toBeVisible();

    await page.route('**/api/editorial/contributors/varun-malik', route =>
      route.fulfill({ json: { data: contributors[2] } }));
    await page.route('**/test-assets/usable-cover.svg', route =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"/>',
      }));
    await page.goto('/contributors/varun-malik');
    await expect(page.getByTestId('cover-photo')).toHaveCount(1);
    await expect(page.getByText('No LinkedIn link', { exact: true })).toBeVisible();
  });
}

test('a contributor detail 404 is not resurrected from legacy fallback data', async ({ page }) => {
  await page.route('**/api/editorial/contributors/savi', route =>
    route.fulfill({ status: 404, json: { error: { message: 'Not found' } } }));
  await page.goto('/contributors/savi');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Savi', exact: true })).toHaveCount(0);
});

test('the contributor collection failure fallback excludes unauthorized profiles', async ({ page }) => {
  await page.route('**/api/editorial?collection=contributors', route =>
    route.fulfill({ status: 503, json: { error: { message: 'Unavailable' } } }));
  await page.goto('/contributors');
  await expect(page.getByRole('heading', { name: 'Varun Malik', exact: true })).toBeVisible({ timeout: 15_000 });
  for (const name of ['Chandni', 'Kuljeet', 'Abdul', 'Ahmed', 'Pranata']) {
    await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(0);
  }
});

test('editor saves a valid LinkedIn URL for an existing placeholder contributor', async ({ page }) => {
  await page.route('**/src/hooks/use-editorial.ts*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.editorWrites = [];
      const mutation = kind => ({
        isPending: false, isError: false, reset() {},
        mutate(payload) { window.editorWrites.push({ kind, payload }); }
      });
      export const useCreateEditorialItem = () => mutation('create');
      export const useUpdateEditorialItem = () => mutation('edit');
      export const useGenerateEventImage = () => mutation('image');
      export const useGenerateCoverImage = () => mutation('cover');
      export const useMarkEventEnded = () => mutation('end');
      export const useGenerateEditorialContent = () => mutation('generate');
    `,
  }));
  await page.route('**/__contributor-editor-test', route => route.fulfill({
    contentType: 'text/html',
    body: `
      <html><body><div id="root"></div>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        const { default: React } = await import('/node_modules/.vite/deps/react.js');
        const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { EditorForm } = await import('/src/pages/admin-components/editor-form.tsx');
        const item = ${JSON.stringify(item('saved-placeholder', 'Saved Placeholder', {
          isPlaceholder: true,
          isNamedProspect: true,
        }))};
        ReactDOM.createRoot(document.getElementById('root')).render(
          React.createElement(EditorForm, { collection: 'contributors', item, onClose() {} })
        );
      </script></body></html>`,
  }));

  await page.goto('/__contributor-editor-test');
  await page.getByLabel('LinkedIn Profile URL').fill('https://www.linkedin.com/in/saved-placeholder');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).editorWrites.length)).toBe(1);
  const write = await page.evaluate(() => (window as any).editorWrites[0]);
  expect(write.payload.data.data.linkedinUrl).toBe('https://www.linkedin.com/in/saved-placeholder');
  expect(write.payload.data.data.isPlaceholder).toBe(true);
});