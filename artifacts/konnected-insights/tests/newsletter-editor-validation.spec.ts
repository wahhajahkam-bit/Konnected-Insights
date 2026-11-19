import { expect, test } from '@playwright/test';

// Component integration only: real EditorForm/inputs/AI merge/submit handler,
// with mutation hooks stubbed at the browser module boundary. Staff authorization
// and real persistence are covered separately; this fixture cannot write data.
for (const mode of ['create', 'edit'] as const) {
  test(`newsletter ${mode} permits absent metadata but blocks invalid supplied links`, async ({ page }) => {
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
        export const useGenerateEditorialContent = () => ({
          ...mutation('generate'),
          mutate(payload, callbacks) {
            callbacks.onSuccess({ data: {
              title: 'Source newsletter', slug: 'source-newsletter',
              data: { category: 'Research', excerpt: 'Source excerpt', url: 'https://example.com/newsletter' },
              source: { url: 'https://example.com/newsletter' },
              feedback: { completed: [], missing: ['Author and cover'], warnings: [] }
            } });
          }
        });
      `,
    }));
    await page.route('**/__newsletter-editor-test', route => route.fulfill({
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
          const item = ${mode === 'edit' ? JSON.stringify({
            id: 'test-newsletter', collection: 'newsletters', version: 3,
            title: 'Source newsletter', slug: 'source-newsletter', status: 'draft', data: {},
          }) : 'undefined'};
          ReactDOM.createRoot(document.getElementById('root')).render(
            React.createElement(EditorForm, { collection: 'newsletters', item, onClose() {} })
          );
        </script></body></html>`,
    }));
    await page.goto('/__newsletter-editor-test');
    const save = page.getByRole('button', { name: 'Save Changes' });
    // Applying an incomplete AI draft must not invent the author or cover.
    await page.getByLabel('Public source URL (Optional)').fill('https://example.com/newsletter');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.getByRole('button', { name: 'Apply to Form' }).click();
    await expect(page.getByLabel('Author Name · Optional', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Cover Image · Optional', { exact: true })).toHaveValue('');
    await expect(page.getByText('No cover photo', { exact: true })).toBeVisible();
    await expect(save).toBeEnabled();

    for (const label of ['Category', 'Excerpt', 'External URL', 'Author Name']) {
      const input = page.getByLabel(`${label} · Optional`, { exact: true });
      await input.fill('');
      await expect(input).toHaveAttribute('aria-invalid', 'false');
      await expect(save).toBeEnabled();
    }

    await page.getByLabel('External URL · Optional', { exact: true }).fill('https://');
    await expect(save).toBeDisabled();
    await page.locator('form').evaluate(form => (form as HTMLFormElement).requestSubmit());
    await expect.poll(() => page.evaluate(() => (window as any).editorWrites.length)).toBe(0);
    await page.getByLabel('External URL · Optional', { exact: true }).fill('');
    const validData = JSON.parse(await page.locator('textarea[name="data"]').inputValue());
    await expect(save).toBeEnabled();
    await save.click();
    await expect.poll(() => page.evaluate(() => (window as any).editorWrites.length)).toBe(1);
    const write = await page.evaluate(() => (window as any).editorWrites[0]);
    expect(write.kind).toBe(mode);
    const payload = mode === 'edit' ? write.payload.data : write.payload;
    expect(payload.status).toBe('draft');
    expect(payload.data).toEqual(validData);
    expect(payload.data.author?.image).toBeUndefined();
  });
}