import { expect, test, type Page } from '@playwright/test';

async function expectSectionInView(page: Page) {
  const section = page.getByTestId('section-home-masterclasses');
  await expect(section).toBeFocused();
  await expect.poll(() => page.evaluate(() => {
    const heading = document.querySelector('#masterclass-series-heading')!.getBoundingClientRect();
    const header = document.querySelector('header')!.getBoundingClientRect();
    return heading.top >= header.bottom && heading.bottom < innerHeight && scrollY > 0;
  })).toBe(true);
  // Catch delayed history restoration, not just the initial fragment jump.
  await page.waitForTimeout(300);
  await expect(section.getByRole('heading', { name: 'Masterclass Series', exact: true })).toBeInViewport();
  await expect(page).toHaveURL(/\/#masterclass-series$/);
}

for (const width of [1440, 390]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`hero masterclass cue works at ${width}px with ${reducedMotion} motion`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion });
      await page.goto('/');
      const cue = page.getByRole('link', { name: 'Next: Masterclass Series', exact: true });
      await expect(cue).toHaveAttribute('href', '#masterclass-series');
      const box = await cue.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await page.evaluate(() => {
        const original = Element.prototype.scrollIntoView;
        (window as any).__cueScrollBehaviors = [];
        Element.prototype.scrollIntoView = function (options) {
          if (this.id === 'masterclass-series') {
            (window as any).__cueScrollBehaviors.push((options as ScrollIntoViewOptions)?.behavior);
          }
          return original.call(this, options);
        };
      });
      await cue.click();
      await expectSectionInView(page);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await cue.click();
      await expectSectionInView(page);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.getByTestId('button-hero-newsletters').focus();
      await page.keyboard.press('Tab');
      await expect(cue).toBeFocused();
      await expect(cue).toHaveCSS('outline-style', 'solid');
      await page.keyboard.press('Enter');
      await expectSectionInView(page);
      expect(await page.evaluate(() => (window as any).__cueScrollBehaviors)).toEqual(
        Array(3).fill(reducedMotion === 'reduce' ? 'instant' : 'smooth'),
      );
      await page.getByTestId('button-hero-bigger-picture').click();
      await expect(page).toHaveURL(/\/bigger-picture$/);
      await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
      await page.goto('/');
      await page.getByTestId('button-hero-newsletters').click();
      await expect(page).toHaveURL(/\/newsletters$/);
    });
  }
}