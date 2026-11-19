import { expect, test, type Locator, type Page } from '@playwright/test';

const shapes = [
  { slug: 'portrait', width: 600, height: 2400 },
  { slug: 'square', width: 900, height: 900 },
  { slug: 'landscape', width: 1600, height: 600 },
];
const artworkLabel = 'AI-generated artwork · illustrative, not source evidence';
const items = shapes.map(({ slug }) => ({
  id: slug, slug, collection: 'masterclasses', title: `${slug} cover`,
  data: {
    image: `/cover-fixtures/${slug}.svg`,
    url: `https://example.com/${slug}`,
    imageProvenance: 'ai-generated-representative-artwork',
  },
}));

async function expectContained(image: Locator, maxHeight: number) {
  await expect(image).toBeVisible();
  await expect(image).toHaveCSS('object-fit', 'contain');
  await expect(image).toHaveCSS('object-position', '50% 50%');
  await expect(image).toHaveCSS('transform', 'none');
  const metrics = await image.evaluate((node: HTMLImageElement) => {
    const frame = node.parentElement!.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    return {
      loaded: node.complete && node.naturalWidth > 0,
      frameHeight: frame.height, width: box.width, height: box.height,
      inside: box.left >= frame.left && box.right <= frame.right + 1 &&
        box.top >= frame.top && box.bottom <= frame.bottom + 1,
      hasCaption: node.nextElementSibling !== null,
    };
  });
  expect(metrics.loaded).toBe(true);
  expect(metrics.frameHeight).toBeLessThanOrEqual(maxHeight + 1);
  expect(metrics.width).toBeGreaterThan(0);
  expect(metrics.height).toBeGreaterThan(0);
  expect(metrics.inside).toBe(true);
  expect(metrics.hasCaption).toBe(false);
  expect(metrics.height).toBeCloseTo(metrics.frameHeight, 0);
}

async function setupMasterclassFixtures(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/cover-fixtures/*.svg', route => {
    const shape = shapes.find(s => route.request().url().endsWith(`${s.slug}.svg`))!;
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${shape.width}" height="${shape.height}"><rect x="2" y="2" width="${shape.width - 4}" height="${shape.height - 4}" fill="#ded8ed" stroke="#36274e" stroke-width="4"/><text x="10" y="30">Top edge</text><text x="10" y="${shape.height - 10}">Bottom edge</text></svg>`,
    });
  });
  await page.route('**/api/editorial?collection=masterclasses', route =>
    route.fulfill({ json: { data: items } }));
  await page.route('**/api/editorial/masterclasses/*', route =>
    route.fulfill({ json: { data: items.find(i => route.request().url().endsWith(i.slug)) } }));
}

for (const width of [390, 1440]) {
  test(`standalone public cards have no artwork captions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const cards = ['featured', 'supporting', 'missing'].map(slug => ({
      id: slug, slug, title: `${slug} newsletter`,
      data: {
        image: slug === 'missing' ? undefined : '/cover-fixtures/card.svg',
        img: slug === 'missing' ? undefined : '/cover-fixtures/card.svg',
        url: `https://example.com/${slug}`,
        imageProvenance: 'ai-generated-representative-artwork',
      },
    }));
    await page.route('**/cover-fixtures/card.svg', route => route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#ded8ed"/></svg>',
    }));
    await page.route('**/api/editorial?collection=*', route => {
      const collection = new URL(route.request().url()).searchParams.get('collection');
      return route.fulfill({ json: { data: ['newsletters', 'future-work'].includes(collection!) ? cards : [] } });
    });
    await page.route('**/api/future-work', route => route.fulfill({
      json: { data: { functions: [], content: [], programs: [], news: [] } },
    }));
    await page.goto('/');
    const newsletters = page.getByTestId('section-home-newsletters');
    await newsletters.scrollIntoViewIfNeeded();
    for (const card of cards) {
      const link = page.getByTestId(`link-newsletter-${card.slug}`);
      await expect(link).toHaveAttribute('href', card.data.url);
      if (card.data.image) await expect(link.locator('img')).toHaveAttribute('src', card.data.image);
      else await expect(link.getByText('No cover photo')).toHaveCount(1);
    }
    await expect(page.getByText(/AI-generated artwork|illustrative, not source evidence/)).toHaveCount(0);
    await page.goto('/future-of-work');
    const profiles = page.locator('section[aria-labelledby="editorial-profiles"]');
    await expect(page.getByRole('heading', { name: 'Business Functions' })).toBeVisible();
    await expect(profiles).toHaveCount(0);
    await expect(page.getByText('Editorial Career Profiles')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Read Profile/ })).toHaveCount(0);
    await expect(page.getByText(/AI-generated artwork|illustrative, not source evidence/)).toHaveCount(0);
  });

  test(`masterclass collection covers remain complete and bounded at ${width}px`, async ({ page }) => {
    await setupMasterclassFixtures(page, width);
    await page.goto('/masterclass-series');
    for (const item of items) {
      const image = page.getByRole('img', { name: item.title, exact: true });
      await image.scrollIntoViewIfNeeded();
      await expectContained(image, width < 768 ? 256 : 288);
      await image.hover();
      await expectContained(image, width < 768 ? 256 : 288);
      await expect(image.locator('xpath=ancestor::a')).toHaveAttribute('href', `/masterclass-series/${item.slug}`);
    }
    await expect(page.getByText(artworkLabel, { exact: true })).toHaveCount(0);
    await page.getByRole('img', { name: items[0].title, exact: true }).click();
    await expect(page).toHaveURL(/masterclass-series\/portrait$/);
  });

  for (const item of items) {
    test(`masterclass ${item.slug} detail cover remains complete and bounded at ${width}px`, async ({ page }) => {
      await setupMasterclassFixtures(page, width);
      await page.goto(`/masterclass-series/${item.slug}`);
      const image = page.getByRole('img', { name: item.title, exact: true });
      await expectContained(image, width < 768 ? 288 : 384);
      const source = image.locator('xpath=ancestor::a');
      await expect(source).toHaveAttribute('href', item.data.url);
      await expect(source).toHaveAttribute('target', '_blank');
      await image.hover();
      await expectContained(image, width < 768 ? 288 : 384);
      await expect(page.getByText(artworkLabel, { exact: true })).toHaveCount(0);
    });
  }

  test(`homepage shared CoverPhoto retains its cropped treatment at ${width}px`, async ({ page }) => {
    await setupMasterclassFixtures(page, width);
    // Another shared CoverPhoto consumer must retain its default cropped treatment.
    await page.goto('/');
    const featured = page.getByTestId(`link-featured-masterclass-${items[0].slug}`);
    await featured.scrollIntoViewIfNeeded();
    await expect(featured.getByRole('img', { name: items[0].title, exact: true })).toHaveCSS('object-fit', 'cover');
    await expect(featured.getByText(artworkLabel, { exact: true })).toHaveCount(0);
  });

  test(`masterclass missing and failed covers keep placeholders at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const missing = [
      { id: 'missing', slug: 'missing', title: 'Missing cover', data: {} },
      { id: 'failed', slug: 'failed', title: 'Failed cover', data: { image: '/cover-fixtures/broken.svg', imageProvenance: 'ai-generated-representative-artwork' } },
    ];
    await page.route('**/cover-fixtures/broken.svg', route => route.fulfill({ status: 404 }));
    await page.route('**/api/editorial?collection=masterclasses', route => route.fulfill({ json: { data: missing } }));
    await page.route('**/api/editorial/masterclasses/*', route => route.fulfill({ json: { data: missing.find(i => route.request().url().endsWith(i.slug)) } }));
    await page.goto('/masterclass-series');
    await expect(page.getByText('No cover photo', { exact: true })).toHaveCount(2);
    for (const item of missing) {
      await page.goto(`/masterclass-series/${item.slug}`);
      const placeholder = page.getByText('No cover photo', { exact: true });
      await expect(placeholder).toBeVisible();
      expect((await placeholder.locator('..').boundingBox())!.height).toBeLessThanOrEqual(width < 768 ? 289 : 385);
      await expect(placeholder.locator('xpath=ancestor::a')).toHaveCount(0);
      await expect(page.getByText(artworkLabel, { exact: true })).toHaveCount(0);
      await expect(page.locator('main img')).toHaveCount(0);
    }
  });
}