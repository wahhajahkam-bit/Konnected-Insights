import { expect, test, type Page } from '@playwright/test';

async function sectionVisible(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const heading = document.getElementById('masterclass-series-heading')?.getBoundingClientRect();
    const header = document.querySelector('header')?.getBoundingClientRect();
    return !!heading && !!header && heading.top >= header.bottom && heading.bottom < innerHeight;
  })).toBe(true);
  await page.waitForTimeout(350);
  await expect(page.locator('#masterclass-series-heading')).toBeInViewport();
}

async function position(page: Page, y: number) {
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(y, -1);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(y, -1);
}

for (const width of [1440, 390]) {
  for (const reducedMotion of ['reduce', 'no-preference'] as const) {
    test(`shared homepage fragments and history at ${width}px with ${reducedMotion}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion });
      await page.goto('/#masterclass-series');
      await sectionVisible(page);
      await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
      await page.reload();
      await sectionVisible(page);

      // Save a reading position distinct from the fragment's initial target.
      await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
      await position(page, 700);
      await page.evaluate(() => history.pushState(null, '', '/bigger-picture'));
      await position(page, 0);
      await page.evaluate(() => window.scrollTo({ top: 450, behavior: 'instant' }));
      await position(page, 450);
      await page.evaluate(() => history.pushState(null, '', '/#masterclass-series'));
      await sectionVisible(page);
      const fragmentY = await page.evaluate(() => scrollY);
      await page.goBack();
      await position(page, 450);
      await page.goBack();
      await position(page, 700);
      await page.goForward();
      await position(page, 450);
      await page.goForward();
      await position(page, fragmentY);
      await sectionVisible(page);
    });
  }
}