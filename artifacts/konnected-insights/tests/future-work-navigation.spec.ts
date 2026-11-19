import { expect, test, type Page } from '@playwright/test';
import type { FwFunction } from '../src/lib/api-future-work';

const functionId = '11111111-1111-4111-8111-111111111111';
const functionSlug = 'task55-operations';
const publishedAt = '2026-01-15T00:00:00.000Z';

const functions = [
  {
    id: functionId,
    slug: functionSlug,
    name: 'Task55 Operations',
    description: 'How operating models and delivery practices may change.',
    sortOrder: 1,
    enabled: true,
    revision: 1,
    presentation: {
      shortIntroduction: 'A concise, function-first introduction for operations leaders.',
    },
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'task55-finance',
    name: 'Task55 Finance',
    description: 'Evidence-conscious financial planning.',
    sortOrder: 2,
    enabled: true,
    revision: 1,
    presentation: {},
  },
];

const evidence = (year: number, lens: string) => ({
  url: `https://example.com/evidence/${year}-${lens}`,
  title: `${year} ${lens} evidence`,
  publisher: 'Task55 Research Institute',
  publishedAt,
  fetchedAt: publishedAt,
  authenticity: 'Fixture from a named institutional publisher.',
  contentHash: `${year}-${lens}-hash`,
});

const content = ([2030, 2050, 2100] as const).flatMap(horizon =>
  (['technology', 'field'] as const).map((lens, index) => ({
    id: `${horizon}-${lens}`,
    functionId,
    horizon,
    lens,
    title: `${horizon} ${lens === 'technology' ? 'automation systems' : 'operating structures'}`,
    summary: `${horizon} ${lens} summary shown only for its selected horizon.`,
    skills: [`${horizon} ${lens} capability`],
    sources: [evidence(horizon, lens)],
    status: 'published',
    lastVerifiedAt: publishedAt,
    updatedAt: publishedAt,
    revision: index + 1,
    stale: false,
    publishedAt,
  })),
);

const overview = {
  functions,
  content,
  programs: [],
  news: [],
  freshness: {
    status: 'current',
    oldestUpdatedAt: publishedAt,
    overdueCount: 0,
    label: 'Current',
    href: '/future-of-work',
  },
  horizons: [
    { year: 2030, label: 'Near horizon', disclaimer: '' },
    { year: 2050, label: 'Structural horizon', disclaimer: '' },
    { year: 2100, label: 'Scenario horizon', disclaimer: 'Speculative scenario, not a forecast.' },
  ],
};

const generatedCoverFunctions = [
  ['finance', 'Finance', 'Financial planning and stewardship.'],
  ['marketing', 'Marketing', 'Audience strategy and market development.'],
  ['hr', 'Human Resources', 'Workforce and talent leadership.'],
  ['operations', 'Operations', 'Operating models and delivery systems.'],
  ['sales', 'Sales', 'Commercial growth and customer relationships.'],
  ['technology-it', 'Technology & IT', 'Technology strategy and digital operations.'],
  ['grc', 'Governance, Risk & Compliance', 'Governance, risk and compliance leadership.'],
].map(([slug, name, description], index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  slug,
  name,
  description,
  sortOrder: index + 1,
  enabled: true,
  revision: 1,
  presentation: {},
}));

async function mockOverviewFunctions(page: Page, fixtureFunctions: FwFunction[]) {
  await page.route('**/api/future-work', route =>
    route.fulfill({
      json: {
        data: {
          ...overview,
          functions: fixtureFunctions,
        },
      },
    }),
  );
}

async function mockFutureWork(page: Page) {
  await page.route(`**/api/future-work/functions/${functionSlug}`, route =>
    route.fulfill({
      json: {
        data: {
          function: functions[0],
          content,
          programs: [],
          news: [],
          skills: content.filter(item => item.horizon === 2030).flatMap(item => item.skills),
        },
      },
    }),
  );
  await page.route('**/api/future-work', route => route.fulfill({ json: { data: overview } }));
  await page.route('**/api/editorial?collection=future-work', route =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route(`**/api/editorial/future-work/${functionSlug}`, route =>
    route.fulfill({ status: 404, json: { error: { message: 'No legacy profile' } } }),
  );
}

test.beforeEach(async ({ page }) => {
  await mockFutureWork(page);
});

for (const mobile of [false, true]) {
  test(`business function switching preserves horizon and supports Back (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 640 });
    await mockOverviewFunctions(page, [
      functions[1], { ...functions[0], id: 'disabled', slug: 'disabled', name: 'Disabled Function', enabled: false },
      functions[0],
    ]);
    await page.route('**/api/future-work/functions/task55-finance', route => route.fulfill({
      json: { data: { function: functions[1], content: content.map(item => ({
        ...item, id: `finance-${item.id}`, functionId: functions[1].id, title: `Finance ${item.title}`,
      })), programs: [], news: [], skills: [] } },
    }));
    await page.route('**/api/editorial/future-work/task55-finance', route => route.fulfill({
      status: 404, json: { error: { message: 'No legacy profile' } },
    }));
    await page.goto(`/future-of-work/${functionSlug}?horizon=2100`);
    const contents = page.getByRole('navigation', { name: 'Contents', exact: true });
    await contents.getByRole('link', { name: 'Recent News' }).click();
    if (mobile) await page.locator('aside summary').click();
    const navigation = page.getByRole('navigation', { name: 'Business Functions', exact: true });
    await expect(navigation.getByRole('link')).toHaveText(['Task55 Operations', 'Task55 Finance']);
    await expect(navigation.getByRole('link', { name: 'Task55 Operations' })).toHaveAttribute('aria-current', 'page');
    const finance = navigation.getByRole('link', { name: 'Task55 Finance' });
    await finance.focus();
    await expect(finance).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/task55-finance\?horizon=2100$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Task55 Finance' })).toBeFocused();
    await expect(page.locator('#overview')).toContainText(functions[1].description);
    await expect(page.locator('#overview')).not.toContainText(functions[0].presentation.shortIntroduction);
    await expect(page.getByText('Finance 2100 automation systems', { exact: true })).toBeVisible();
    await expect(page.getByText('2100 automation systems', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '2100', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    if (mobile) await page.locator('aside summary').click();
    await expect(navigation.getByRole('link', { name: 'Task55 Finance' })).toHaveAttribute('aria-current', 'page');
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${functionSlug}\\?horizon=2100#news$`));
    await expect(page.getByText('2100 automation systems', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '2100', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Task55 Operations' })).toBeVisible();
    await expect(page.getByRole('button', { name: '2100', exact: true })).toHaveAttribute('aria-current', 'page');
  });
}

test('function list errors leave research available and can be retried', async ({ page }) => {
  let fail = true;
  await page.route('**/api/future-work', route => fail
    ? route.fulfill({ status: 503, json: { error: { message: 'Unavailable' } } })
    : route.fulfill({ json: { data: overview } }));
  await page.goto(`/future-of-work/${functionSlug}?horizon=2050`);
  await expect(page.getByText('2050 automation systems', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to function index' })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Business Functions', exact: true })
    .getByRole('link', { name: 'Task55 Finance' })).toBeVisible();
});

test('the function index is searchable and links directly to a function', async ({ page }) => {
  await page.goto('/future-of-work');

  const search = page.getByPlaceholder('Search functions (e.g. Marketing, Engineering...)');
  await expect(search).toBeVisible();
  await expect(page.getByRole('link', { name: /Task55 Operations/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Task55 Finance/i })).toBeVisible();

  await search.fill('financial');
  await expect(page.getByRole('link', { name: /Task55 Finance/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Task55 Operations/i })).toHaveCount(0);

  await search.fill('operations');
  await page.getByRole('link', { name: /Task55 Operations/i }).click();
  await expect(page).toHaveURL(new RegExp(`/future-of-work/${functionSlug}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Task55 Operations' })).toBeVisible();
});

test('the query-string horizon is selected, shareable, and restored by browser Back', async ({ page }) => {
  await page.goto(`/future-of-work/${functionSlug}?horizon=2050`);

  const horizon2050 = page.getByRole('button', { name: '2050', exact: true });
  const horizon2100 = page.getByRole('button', { name: '2100', exact: true });
  await expect(horizon2050).toHaveAttribute('aria-current', /^(page|true)$/);
  await expect(page.getByText('2050 automation systems', { exact: true })).toBeVisible();
  await expect(page.getByText('2030 automation systems', { exact: true })).toHaveCount(0);
  await expect(page.getByText('2100 automation systems', { exact: true })).toHaveCount(0);

  await horizon2100.click();
  await expect(page).toHaveURL(new RegExp(`\\?horizon=2100(?:#.*)?$`));
  await expect(horizon2100).toHaveAttribute('aria-current', /^(page|true)$/);
  await expect(page.getByText('2100 automation systems', { exact: true })).toBeVisible();
  await expect(page.getByText(/highly speculative.*rather than.*forecast/i)).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`\\?horizon=2050(?:#.*)?$`));
  await expect(horizon2050).toHaveAttribute('aria-current', /^(page|true)$/);
  await expect(page.getByText('2050 automation systems', { exact: true })).toBeVisible();
  await expect(page.getByText(/highly speculative.*rather than.*forecast/i)).toHaveCount(0);
});

test('a selected horizon keeps its lenses distinct and gives honest empty states', async ({ page }) => {
  await page.goto(`/future-of-work/${functionSlug}?horizon=2030`);

  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toHaveCount(0);
  await expect(page.locator('#overview')).toBeVisible();
  await expect(page.locator('#overview')).toContainText(functions[0].presentation.shortIntroduction);
  await expect(page.locator('#overview')).toContainText(functions[0].description);
  await expect(page.getByRole('heading', { name: 'Technology Lens', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Field Lens/i })).toBeVisible();
  await expect(page.getByText('2030 automation systems', { exact: true })).toBeVisible();
  await expect(page.getByText('2030 operating structures', { exact: true })).toBeVisible();
  await expect(page.getByText('No verified recent news available.', { exact: true })).toBeVisible();
  await expect(page.getByText('No recommended programs verified yet.', { exact: true })).toBeVisible();
});

test('local contents links are keyboard focusable and reach their sections', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/future-of-work/${functionSlug}?horizon=2030`);

  const contents = page.getByRole('navigation', { name: /contents/i });
  const news = contents.getByRole('link', { name: /recent news/i });
  await news.focus();
  await expect(news).toBeFocused();
  await expect(news).toHaveCSS('outline-style', /^(?!none$).+/);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#news$/);
  await expect(page.getByRole('heading', { name: 'Recent News', exact: true })).toBeInViewport();
});

test('public sections and contents put news and programs before outlook', async ({ page }) => {
  await page.goto(`/future-of-work/${functionSlug}?horizon=2030`);

  const headingOrder = await page.locator('main').locator('#overview, #news, #programs, #outlook, #implications, #sources').allTextContents();
  expect(headingOrder).toEqual([
    '01Recent News',
    '02Recommended Programs',
    '03Outlook',
    '04Implications',
    '05Sources',
  ]);
  await expect(page.getByRole('navigation', { name: 'Contents' }).getByRole('link')).toHaveText([
    '01Recent News',
    '02Recommended Programs',
    '03Outlook',
    '04Implications',
    '05Sources',
  ]);
});

for (const mobile of [false, true]) {
  test(`all function header introductions support old overview anchors (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    await mockOverviewFunctions(page, generatedCoverFunctions);
    for (const fn of generatedCoverFunctions) {
      await page.route(`**/api/future-work/functions/${fn.slug}`, route => route.fulfill({
        json: { data: { function: { ...fn, description: '' }, content: [], programs: [], news: [], skills: [] } },
      }));
      await page.route(`**/api/editorial/future-work/${fn.slug}`, route => route.fulfill({
        status: 404, json: { error: { message: 'No legacy profile' } },
      }));
      await page.goto(`/future-of-work/${fn.slug}?horizon=2050#overview`);
      const introduction = page.locator('#overview');
      await expect(introduction).toBeFocused();
      await expect(introduction).toBeInViewport();
      await expect(introduction).not.toHaveText('');
      await expect(page.locator('main #overview')).toHaveCount(0);
      await expect(page.getByRole('navigation', { name: 'Contents' }).getByRole('link', { name: /overview/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '2050', exact: true })).toHaveAttribute('aria-current', 'page');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  });
}

test('mobile horizon and local navigation controls do not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/future-of-work/${functionSlug}?horizon=2050`);

  const mobileHorizon = page.getByRole('combobox', { name: /horizon/i });
  await expect(page.getByRole('navigation', { name: 'Contents' })).toBeVisible();
  await expect(mobileHorizon).toHaveValue('2050');
  await mobileHorizon.selectOption('2100');
  await expect(page).toHaveURL(new RegExp(`\\?horizon=2100(?:#.*)?$`));
  await expect.poll(() =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(0);
});

test('all seven known functions use distinct, loadable generated covers', async ({ page }) => {
  await mockOverviewFunctions(page, generatedCoverFunctions);
  await page.goto('/future-of-work');

  const covers = page.getByTestId('function-card-cover');
  await expect(covers).toHaveCount(7);
  for (const cover of await covers.all()) {
    await cover.scrollIntoViewIfNeeded();
    await expect(cover).toHaveAttribute('data-state', 'loaded');
  }

  const images = covers.locator('img');
  await expect(images).toHaveCount(7);
  const imageDetails = await images.evaluateAll(elements =>
    elements.map(element => {
      const image = element as HTMLImageElement;
      return {
        path: new URL(image.currentSrc || image.src).pathname,
        naturalWidth: image.naturalWidth,
        alt: image.alt,
      };
    }),
  );

  expect(imageDetails.map(image => image.path)).toEqual(
    generatedCoverFunctions.map(item => `/images/future-work/${item.slug}.webp`),
  );
  expect(new Set(imageDetails.map(image => image.path)).size).toBe(7);
  expect(imageDetails.every(image => image.naturalWidth > 0)).toBe(true);
  expect(imageDetails.every(image => image.alt === '')).toBe(true);
});

test('an editorial cover and alt text take priority over the generated cover', async ({ page }) => {
  const editorialUrl = 'https://covers.example.test/editorial-finance.webp';
  const editorialAlt = 'Finance leaders reviewing a scenario model';
  const editorialImage = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAJZ7nL8AAAAASUVORK5CYII=',
    'base64',
  );
  const requestedImages: string[] = [];
  page.on('request', request => {
    if (request.resourceType() === 'image') requestedImages.push(request.url());
  });
  await page.route(editorialUrl, route =>
    route.fulfill({ status: 200, contentType: 'image/png', body: editorialImage }),
  );
  await mockOverviewFunctions(page, [{
    ...generatedCoverFunctions[0],
    presentation: { heroCoverUrl: editorialUrl, heroAlt: editorialAlt },
  }]);

  await page.goto('/future-of-work');

  const cover = page.getByTestId('function-card-cover');
  await expect(cover).toHaveAttribute('data-state', 'loaded');
  const image = cover.locator('img');
  await expect(image).toHaveAttribute('src', editorialUrl);
  await expect(image).toHaveAttribute('alt', editorialAlt);
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(requestedImages.some(url => url.endsWith('/images/future-work/finance.webp'))).toBe(false);
});

test('unknown and failed covers settle on neutral placeholders without retrying', async ({ page }) => {
  const failedUrl = 'https://covers.example.test/unavailable.webp';
  let failedRequests = 0;
  await page.route(failedUrl, route => {
    failedRequests += 1;
    return route.abort('failed');
  });
  await mockOverviewFunctions(page, [
    {
      ...generatedCoverFunctions[0],
      id: '00000000-0000-4000-8000-000000000099',
      slug: 'customer-success',
      name: 'Customer Success',
    },
    {
      ...generatedCoverFunctions[1],
      presentation: { heroCoverUrl: failedUrl, heroAlt: 'Unavailable editorial image' },
    },
  ]);

  await page.goto('/future-of-work');

  const unknownCover = page.getByRole('link', { name: /Customer Success/i }).getByTestId('function-card-cover');
  const failedCover = page.getByRole('link', { name: /Marketing/i }).getByTestId('function-card-cover');
  await expect(unknownCover).toHaveAttribute('data-state', 'missing');
  await expect(unknownCover.locator('img')).toHaveCount(0);
  await expect(failedCover).toHaveAttribute('data-state', 'failed');
  await expect(failedCover.locator('img')).toBeHidden();
  await page.waitForTimeout(250);
  expect(failedRequests).toBe(1);
});

test('a delayed cover reserves its 16:9 space while loading', async ({ page }) => {
  await page.route('**/images/future-work/operations.webp', async route => {
    await new Promise(resolve => setTimeout(resolve, 600));
    await route.continue();
  });
  await mockOverviewFunctions(page, [generatedCoverFunctions[3]]);

  await page.goto('/future-of-work', { waitUntil: 'domcontentloaded' });

  const cover = page.getByTestId('function-card-cover');
  await expect(cover).toHaveAttribute('data-state', 'loading');
  const loadingBox = await cover.boundingBox();
  expect(loadingBox).not.toBeNull();
  expect(loadingBox!.height).toBeGreaterThan(0);
  expect(loadingBox!.width / loadingBox!.height).toBeCloseTo(16 / 9, 1);
  await expect(cover).toHaveAttribute('data-state', 'loaded');
  const loadedBox = await cover.boundingBox();
  expect(loadedBox!.height).toBeCloseTo(loadingBox!.height, 0);
});

test('function cards stay enabled-only, ordered, searchable, and show an honest empty state', async ({ page }) => {
  await mockOverviewFunctions(page, [
    { ...generatedCoverFunctions[4], sortOrder: 30 },
    { ...generatedCoverFunctions[0], sortOrder: 10 },
    { ...generatedCoverFunctions[3], sortOrder: 20, enabled: false },
    { ...generatedCoverFunctions[1], sortOrder: 20 },
  ]);
  await page.goto('/future-of-work');

  const cards = page.locator('main').getByRole('link');
  await expect(cards).toHaveCount(3);
  await expect(cards).toHaveText([/Finance/, /Marketing/, /Sales/]);
  await expect(page.getByRole('link', { name: /Operations/i })).toHaveCount(0);

  const search = page.getByRole('textbox', { name: 'Search business functions' });
  await search.fill('audience strategy');
  await expect(page.locator('main').getByRole('link')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Marketing/i })).toBeVisible();

  await search.fill('not a real function');
  await expect(page.locator('main').getByRole('link')).toHaveCount(0);
  await expect(page.getByText('No functions found matching "not a real function".', { exact: true })).toBeVisible();
  await expect(page.getByText('0 Functions', { exact: true })).toBeVisible();
});

test('full-card links work from the keyboard and preserve the selected horizon', async ({ page }) => {
  await mockOverviewFunctions(page, generatedCoverFunctions.slice(0, 2));
  await page.goto('/future-of-work?horizon=2050');

  const financeCard = page.getByRole('link', { name: /Finance/i });
  await expect(financeCard.getByTestId('function-card-cover')).toBeVisible();
  await financeCard.focus();
  await expect(financeCard).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/future-of-work\/finance\?horizon=2050$/);
});

test('mobile function covers remain 16:9 and do not cause horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockOverviewFunctions(page, generatedCoverFunctions);
  await page.goto('/future-of-work');

  const covers = page.getByTestId('function-card-cover');
  await expect(covers).toHaveCount(7);
  for (const cover of await covers.all()) {
    await cover.scrollIntoViewIfNeeded();
    await expect(cover).toHaveAttribute('data-state', 'loaded');
    const box = await cover.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1);
  }
  await expect.poll(() =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(0);
});