import { expect, test } from '@playwright/test';

const routes = [
  ['newsletters', '/newsletters'],
  ['masterclasses', '/masterclass-series'],
  ['future-work', '/future-of-work/optional-content?view=editorial'],
  ['events', '/events'],
  ['talks', '/talks'],
  ['contributors', '/contributors'],
  ['communities', '/communities'],
] as const;

for (const [collection, path] of routes) {
  test(`${collection} shows title-only published content without broken covers or external links`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const item = {
      id: `optional-${collection}`, slug: 'optional-content', collection,
      title: 'Verified source title', status: 'published', version: 1, sortOrder: 0,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', data: {},
    };
    await page.route(`**/api/editorial?collection=${collection}`, route => route.fulfill({ json: { data: [item] } }));
    if (collection === 'future-work') {
      await page.route('**/api/editorial/future-work/optional-content', route =>
        route.fulfill({ json: { data: item } }));
    }
    await page.goto(path);
    await expect(page.getByText('Verified source title', { exact: true }).first()).toBeVisible();
    if (collection === 'contributors') {
      await expect(page.getByText('No cover photo', { exact: true })).toHaveCount(0);
      await expect(page.getByText('No LinkedIn link', { exact: true })).toBeVisible();
    } else if (collection !== 'future-work') {
      await expect(page.getByText('No cover photo', { exact: true }).first()).toBeVisible();
    }
    expect(errors).toEqual([]);
    expect(await page.locator('img[src=""], img:not([src])').count()).toBe(0);
    if (collection === 'talks') {
      await expect(page.getByText('Video not available')).toBeVisible();
      await expect(page.locator('iframe')).toHaveCount(0);
    }
    if (collection === 'events') {
      await expect(page.getByText('Date to be confirmed').first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Register', exact: true })).toHaveCount(0);
    }
    if (collection === 'newsletters' || collection === 'communities') {
      await expect(page.getByText('Verified source title', { exact: true }).locator('xpath=ancestor::a')).toHaveCount(0);
    }
  });
}