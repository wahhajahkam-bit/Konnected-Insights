import { expect, test } from '@playwright/test';

// Browser component integration: upload transport and AI are stubbed; the actual
// panel and crop canvas run. This does not claim to verify AI OCR accuracy.
for (const collection of ['newsletters', 'masterclasses', 'future-work', 'events', 'talks', 'contributors', 'communities']) {
  test(`${collection} accepts two screenshots without a public link`, async ({ page }) => {
    await page.route('**/src/hooks/use-editorial.ts*', route => route.fulfill({
      contentType: 'application/javascript',
      body: `window.generatedInputs = [];
        export const useGenerateEditorialContent = () => ({
          isPending: false, isError: false, reset() {},
          mutate(payload) { window.generatedInputs.push(payload); }
        });`,
    }));
    let uploads = 0;
    let publicUploads = 0;
    await page.route('**/api/storage/evidence/uploads', route => route.fulfill({
      json: { data: { url: `/api/storage/evidence/drive/screenshot${++uploads}fixture` } },
    }));
    await page.route('**/api/storage/uploads', route => {
      publicUploads++;
      expect(route.request().headers()['content-type']).toBe('image/jpeg');
      return route.fulfill({ json: { data: { url: '/cropped-cover.jpg' } } });
    });
    await page.route('**/__screenshots-test', route => route.fulfill({
      contentType: 'text/html',
      body: `<html><body><div id="root"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        const { default: React } = await import('/node_modules/.vite/deps/react.js');
        const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { AiAutofillPanel } = await import('/src/pages/admin-components/ai-autofill-panel.tsx');
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(AiAutofillPanel, {
          collection: ${JSON.stringify(collection)}, currentDraft: {title:'',slug:'',data:{}},
          onApply() {}, onApplyMedia(field,url) { window.appliedMedia = {field,url}; }
        }));
        </script></body></html>`,
    }));
    await page.goto('/__screenshots-test');
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 100;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#bfa476';
      context.fillRect(0, 0, 200, 100);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByTestId('input-screenshots').setInputFiles([
      { name: 'source-one.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') },
      { name: 'source-two.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') },
    ]);
    const generate = page.getByRole('button', { name: 'Generate', exact: true });
    await expect(generate).toBeEnabled();
    await expect(page.getByTestId('text-screenshot-count')).toHaveText('2 / 8');
    await generate.click();
    const inputs = await page.evaluate(() => (window as any).generatedInputs);
    expect(inputs[0].collection).toBe(collection);
    expect(inputs[0].sourceUrl).toBeUndefined();
    expect(inputs[0].screenshotUrls).toHaveLength(2);
    expect(publicUploads).toBe(0);
    if (collection === 'newsletters') {
      await page.getByTestId('button-crop-cover-1').click();
      const applyCrop = page.getByTestId('button-confirm-crop');
      await expect(applyCrop).toBeDisabled();
      await page.getByTestId('checkbox-confirm-public-crop').check();
      await expect(applyCrop).toBeEnabled();
      await applyCrop.click();
      await expect.poll(() => page.evaluate(() => (window as any).appliedMedia)).toEqual({ field: 'cover', url: '/cropped-cover.jpg' });
      expect(publicUploads).toBe(1);
    }
    await page.getByTestId('button-remove-screenshot-1').click();
    await expect(page.getByTestId('text-screenshot-count')).toHaveText('1 / 8');
  });
}