import { expect, test, type Locator, type Page } from '@playwright/test';

const shapes = [
  { slug: 'portrait', width: 600, height: 2400 },
  { slug: 'landscape', width: 1600, height: 600 },
];
const items = [...shapes.map(shape => shape.slug), 'missing', 'failed'].map(slug => ({
  id: slug,
  slug,
  collection: 'events',
  title: `${slug} event cover`,
  data: {
    desc: `Cover regression fixture for ${slug}`,
    images: slug === 'missing' ? [] : [`/event-cover-fixtures/${slug}.svg`],
    // Exercise both event-list sections without depending on today's date.
    ...(slug === 'landscape' || slug === 'failed' ? { year: '2020' } : {}),
  },
}));

async function setupFixtures(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/event-cover-fixtures/*.svg', route => {
    const shape = shapes.find(s => route.request().url().endsWith(`${s.slug}.svg`));
    if (!shape) return route.fulfill({ status: 404 });
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${shape.width}" height="${shape.height}"><rect x="2" y="2" width="${shape.width - 4}" height="${shape.height - 4}" fill="#ded8ed" stroke="#36274e" stroke-width="4"/><text x="10" y="30">Top edge</text><text x="10" y="${shape.height - 10}">Bottom edge</text></svg>`,
    });
  });
  await page.route('**/api/editorial?collection=events', route =>
    route.fulfill({ json: { data: items } }));
  await page.route('**/api/editorial/events/*', route =>
    route.fulfill({ json: { data: items.find(item => route.request().url().endsWith(item.slug)) } }));
  await page.goto('/events');
}

async function expectFrame(frame: Locator) {
  await expect(frame).toBeVisible();
  await expect(frame).toHaveCSS('aspect-ratio', '4 / 3');
  await expect(frame).toHaveCSS('overflow', 'hidden');
  const box = (await frame.boundingBox())!;
  expect(box.width).toBeGreaterThan(0);
  expect(Math.abs(box.width - box.height * 4 / 3)).toBeLessThan(1);
}

async function expectContained(frame: Locator, title: string, shape: typeof shapes[number]) {
  await expectFrame(frame);
  const image = frame.getByRole('img', { name: title, exact: true });
  await expect(image).toHaveAttribute('alt', title);
  await expect(image).toHaveCSS('object-fit', 'contain');
  await expect(image).toHaveCSS('object-position', '50% 50%');
  await expect(image).toHaveCSS('transform', 'none');
  await expect.poll(() => image.evaluate((node: HTMLImageElement) =>
    [node.naturalWidth, node.naturalHeight])).toEqual([shape.width, shape.height]);
  const metrics = await image.evaluate(node => {
    const box = node.getBoundingClientRect();
    const frame = node.parentElement!.getBoundingClientRect();
    return {
      inside: box.left >= frame.left && box.right <= frame.right + 1 &&
        box.top >= frame.top && box.bottom <= frame.bottom + 1,
      centerX: Math.abs(box.left + box.width / 2 - frame.left - frame.width / 2),
      centerY: Math.abs(box.top + box.height / 2 - frame.top - frame.height / 2),
    };
  });
  expect(metrics.inside).toBe(true);
  expect(metrics.centerX).toBeLessThan(1);
  expect(metrics.centerY).toBeLessThan(1);
}

for (const width of [390, 1440]) {
  for (const item of items) {
    test(`${item.slug} event cover stays contained and linked at ${width}px`, async ({ page }) => {
      await setupFixtures(page, width);
      const card = page.getByRole('heading', { name: item.title, exact: true }).locator('..').locator('..');
      const frame = card.getByTestId('cover-photo');
      await frame.scrollIntoViewIfNeeded();
      await expectFrame(frame);
      const link = card.getByRole('link', { name: 'View Details', exact: true });
      await expect(link).toHaveAttribute('href', `/events/${item.slug}`);
      const shape = shapes.find(shape => shape.slug === item.slug);
      if (shape) {
        await expectContained(frame, item.title, shape);
      } else {
        await expect(frame.getByText('No cover photo', { exact: true })).toBeVisible();
        await expect(frame.locator('img')).toHaveCount(0);
      }
      await frame.hover();
      // Sample the settled hover state, not just the start of a CSS transition.
      await page.waitForTimeout(650);
      await expectFrame(frame);
      if (shape) await expectContained(frame, item.title, shape);
      else {
        await expect(frame.getByText('No cover photo', { exact: true })).toBeVisible();
        await expect(frame.locator('img')).toHaveCount(0);
      }
      await link.click();
      await expect(page).toHaveURL(new RegExp(`/events/${item.slug}$`));
      await expect(page.getByRole('heading', { level: 1, name: item.title, exact: true })).toBeVisible();
    });
  }
}