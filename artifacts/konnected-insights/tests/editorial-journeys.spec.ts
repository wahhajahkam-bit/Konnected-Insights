import { expect, test, type Page } from '@playwright/test';
import { validateEditorialWriteData } from '../../../lib/db/src/schema/editorial';
import {
  applyEditorialAiData,
  getInitialEditorialData,
} from '../src/lib/editorial-ai-apply';

const editorialRoutes = [
  { label: 'Homepage', path: '/' },
  { label: 'Bigger Picture collection', path: '/bigger-picture' },
  { label: 'Newsletter collection', path: '/newsletters' },
  { label: 'Masterclass collection', path: '/masterclass-series' },
  { label: 'Masterclass detail', path: '/masterclass-series/future-is-longer' },
  { label: 'Future of Work collection', path: '/future-of-work' },
  { label: 'Future of Work detail', path: '/future-of-work/marketing' },
  { label: 'Contributors collection', path: '/contributors' },
  { label: 'Contributor detail', path: '/contributors/savi' },
  { label: 'Communities collection', path: '/communities' },
  { label: 'Events collection', path: '/events' },
  { label: 'Talks collection', path: '/talks' },
] as const;

const expectNoHorizontalOverflow = async (page: Page, routeLabel: string) => {
  await expect(page.locator('#root')).toBeVisible({ timeout: 15_000 });

  await expect.poll(
    () => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    ),
    { message: `${routeLabel} should not overflow the viewport horizontally` },
  ).toBeLessThanOrEqual(0);
};

const expectPreviewCount = async (page: Page, testIdPrefix: string, max: number) => {
  const count = await page.locator(`[data-testid^="${testIdPrefix}"]`).count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(max);
};

const editorialImageFailures = (page: Page) => {
  const failures: string[] = [];

  page.on('response', (response) => {
    const url = new URL(response.url());
    if (
      url.origin === 'http://127.0.0.1:4173' &&
      url.pathname.startsWith('/editorial/') &&
      response.status() >= 400
    ) {
      failures.push(`${response.status()} ${url.pathname}`);
    }
  });

  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (
      url.origin === 'http://127.0.0.1:4173' &&
      url.pathname.startsWith('/editorial/')
    ) {
      failures.push(`${request.failure()?.errorText ?? 'request failed'} ${url.pathname}`);
    }
  });

  return failures;
};

test('primary navigation updates the route and active-page state', async ({ page }) => {
  await page.goto('/');

  const desktopNav = page.locator('header nav').filter({ visible: true });
  const journeys = [
    { label: 'Bigger Picture', path: '/bigger-picture', heading: 'The future of work is the future of humanity.' },
    { label: 'Newsletters', path: '/newsletters', heading: 'Signals from the frontier.' },
    { label: 'Masterclasses', path: '/masterclass-series', heading: 'The 5-to-10 year horizon.' },
    { label: 'Future of Work', path: '/future-of-work', heading: 'Future of Work' },
    { label: 'Contributors', path: '/contributors', heading: 'The minds building what comes next.' },
    { label: 'Communities', path: '/communities', heading: 'The power of together.' },
    { label: 'Events', path: '/events', heading: 'Meet in the moment.' },
  ];

  for (const journey of journeys) {
    await desktopNav.getByRole('link', { name: journey.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${journey.path}$`));
    await expect(page.getByRole('heading', { level: 1, name: journey.heading })).toBeVisible();
    await expect(desktopNav.getByRole('link', { name: journey.label, exact: true })).toHaveAttribute('aria-current', 'page');
  }

  await expect(desktopNav.getByRole('link', { name: 'Talks', exact: true })).toHaveCount(0);
  await desktopNav.getByRole('button', { name: 'Open additional navigation', exact: true }).click();
  const talksLink = desktopNav.getByRole('menuitem', { name: 'Talks', exact: true });
  await expect(talksLink).toBeVisible();
  await expect(desktopNav.getByRole('menuitem', { name: 'Admin', exact: true })).toBeVisible();
  await talksLink.click();
  await expect(page).toHaveURL(/\/talks$/);
  await expect(desktopNav.getByRole('button', { name: 'Open additional navigation', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(desktopNav.getByRole('menu')).toHaveCount(0);
});

test('desktop secondary navigation supports Escape and outside-click dismissal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const more = page.getByRole('button', { name: 'Open additional navigation', exact: true });
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(more).toBeFocused();

  await more.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.mouse.click(20, 300);
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('homepage previews each editorial collection and interactive previews are operable', async ({ page }) => {
  await page.goto('/');

  const sections = [
    'section-home-masterclasses',
    'section-home-future-work',
    'section-home-newsletters',
    'section-home-contributors',
    'section-home-communities',
    'section-home-events',
    'section-home-talks',
  ];

  for (const testId of sections) {
    await expect(page.getByTestId(testId)).toBeAttached();
  }

  await expectPreviewCount(page, 'link-masterclass-', 6);
  await expectPreviewCount(page, 'link-fow-', 6);
  await expectPreviewCount(page, 'link-newsletter-', 6);
  await expectPreviewCount(page, 'link-contributor-', 6);
  await expectPreviewCount(page, 'link-community-', 6);
  await expectPreviewCount(page, 'link-talk-', 5);

  const masterclassSection = page.getByTestId('section-home-masterclasses');
  await expect(masterclassSection.getByText('Featured', { exact: true })).toBeAttached();
  await expect(masterclassSection.getByText('Up Next', { exact: true })).toBeAttached();
  await expect(page.getByTestId('link-home-masterclasses-all-bottom')).toBeAttached();
  await expect(page.getByTestId('link-home-masterclasses-top')).toBeAttached();

  const next = page.getByTestId('button-newsletters-next');
  const previous = page.getByTestId('button-newsletters-previous');
  await expect(next).toBeEnabled();
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(previous).toBeEnabled();
});

test('homepage keeps its single featured event compact and responsive', async ({ page }) => {
  await page.route('**/api/editorial?collection=events', async (route) => {
    await route.fulfill({
      json: {
        data: [{
          id: 'compact-future-event',
          collection: 'events',
          slug: 'compact-future-event',
          title: 'Compact Future Event',
          status: 'published',
          sortOrder: 0,
          version: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          data: {
            startAt: '2099-01-01T09:00:00+04:00',
            timezone: 'Asia/Dubai',
            location: 'Dubai',
            format: 'in-person',
            desc: 'A confirmed gathering about the future of work.',
            sourceUrl: 'https://example.com/compact-future-event',
            images: ['/editorial/events/konnected-event.jpg'],
          },
        }],
      },
    });
  });

  const featuredLink = page.getByTestId('link-home-featured-event');
  const image = page.getByTestId('home-featured-event-image');
  const copy = page.getByTestId('home-featured-event-copy');

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(featuredLink).toHaveCount(1);
  await expect(featuredLink).toBeVisible();

  const desktop = await Promise.all([
    featuredLink.boundingBox(),
    image.boundingBox(),
    copy.boundingBox(),
  ]);
  expect(desktop.every(Boolean)).toBe(true);
  const [desktopLink, desktopImage, desktopCopy] = desktop;
  expect(desktopLink!.height).toBeLessThanOrEqual(360);
  expect(desktopImage!.x + desktopImage!.width).toBeLessThanOrEqual(desktopCopy!.x + 1);
  expect(desktopImage!.width / desktopLink!.width).toBeGreaterThan(0.35);
  expect(desktopImage!.width / desktopLink!.width).toBeLessThan(0.5);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await Promise.all([
    featuredLink.boundingBox(),
    image.boundingBox(),
    copy.boundingBox(),
  ]);
  expect(mobile.every(Boolean)).toBe(true);
  const [mobileLink, mobileImage, mobileCopy] = mobile;
  expect(mobileImage!.y + mobileImage!.height).toBeLessThanOrEqual(mobileCopy!.y + 2);
  expect(mobileImage!.x).toBeGreaterThanOrEqual(mobileLink!.x);
  expect(mobileImage!.x + mobileImage!.width).toBeLessThanOrEqual(
    mobileLink!.x + mobileLink!.width + 1,
  );
  await expectNoHorizontalOverflow(page, 'Homepage featured event');
});

test('homepage keeps the no-event placeholder compact and contained', async ({ page }) => {
  await page.route('**/api/editorial?collection=events', async (route) => {
    await route.fulfill({ json: { data: [] } });
  });

  const eventsSection = page.getByTestId('section-home-events');
  const placeholder = page.getByTestId('home-event-placeholder');
  const copy = page.getByTestId('home-event-placeholder-copy');
  const featuredLink = page.getByTestId('link-home-featured-event');

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(placeholder).toBeVisible();
  await expect(featuredLink).toHaveCount(0);

  const [desktopSection, desktopPlaceholder] = await Promise.all([
    eventsSection.boundingBox(),
    placeholder.boundingBox(),
  ]);
  expect(desktopSection).not.toBeNull();
  expect(desktopPlaceholder).not.toBeNull();
  expect(desktopPlaceholder!.height).toBeLessThanOrEqual(240);
  expect(desktopPlaceholder!.height / desktopSection!.height).toBeLessThan(0.5);

  await page.setViewportSize({ width: 390, height: 844 });
  const [mobilePlaceholder, mobileCopy] = await Promise.all([
    placeholder.boundingBox(),
    copy.boundingBox(),
  ]);
  expect(mobilePlaceholder).not.toBeNull();
  expect(mobileCopy).not.toBeNull();
  expect(mobileCopy!.x).toBeGreaterThanOrEqual(mobilePlaceholder!.x);
  expect(mobileCopy!.x + mobileCopy!.width).toBeLessThanOrEqual(
    mobilePlaceholder!.x + mobilePlaceholder!.width + 1,
  );
  expect(mobileCopy!.y + mobileCopy!.height).toBeLessThanOrEqual(
    mobilePlaceholder!.y + mobilePlaceholder!.height + 1,
  );
  await expectNoHorizontalOverflow(page, 'Homepage event placeholder');
});

test('newsletter category controls filter the dispatches', async ({ page }) => {
  await page.goto('/newsletters');

  const dispatches = page.locator('main a[target="_blank"]');
  await expect(dispatches).toHaveCount(6);

  await page.getByRole('button', { name: 'Foresight', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Foresight', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dispatches).toHaveCount(1);
  await expect(dispatches.first()).toContainText('Why I believe the future is longer');

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(dispatches).toHaveCount(6);
});

test('event gallery traps focus, closes with Escape, and restores focus', async ({ page }) => {
  // Mock the event detail API response
  await page.route('**/api/editorial/events/test-event', async (route) => {
    await route.fulfill({
      json: {
        data: {
          id: 'test-event',
          slug: 'test-event',
          title: 'Test Event',
          data: {
            title: 'Test Event',
            desc: 'Test description',
            images: ['/test-image-1.jpg', '/test-image-2.jpg']
          }
        }
      }
    });
  });

  await page.goto('/events/test-event');

  const trigger = page.getByRole('button', { name: 'Open Test Event highlight image' });
  await trigger.waitFor({ state: 'visible' });
  await trigger.focus();
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Könnected Insights event image' });
  const closeButton = page.getByRole('button', { name: 'Close gallery' });
  await expect(dialog).toBeVisible();
  await expect(closeButton).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(closeButton).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('talk embed opens and closes without browser errors', async ({ page }) => {
  const browserErrors: string[] = [];
  await page.route('**/talks', async (route) => {
    if (!route.request().isNavigationRequest()) {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'content-security-policy': "require-trusted-types-for 'script'; trusted-types youtube-embed",
      },
    });
  });
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/talks');

  const trigger = page.getByRole('button', {
    name: 'Play Transformation of the Healthcare industry and future outlook',
  });
  await trigger.focus();
  await trigger.click();

  const dialog = page.getByRole('dialog');
  const embed = dialog.locator('iframe');
  await expect(dialog).toBeVisible();
  await expect(embed).toHaveAttribute(
    'src',
    /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}\?autoplay=1$/,
  );

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  const secondTrigger = page.getByRole('button', {
    name: 'Play Sustainability – Moving from risk to opportunity',
  });
  await secondTrigger.click();
  await expect(dialog).toBeVisible();
  await expect(embed).toHaveAttribute(
    'src',
    'https://www.youtube-nocookie.com/embed/DPkb0dzhkPM?autoplay=1',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(secondTrigger).toBeFocused();
  await page.waitForTimeout(250);

  expect(
    browserErrors.filter(error => /TrustedHTML|Trusted Types?/i.test(error)),
  ).toEqual([]);
});

test('events contain only events and derive Upcoming and Ended from timestamps', async ({ page }) => {
  await page.route('**/api/editorial?collection=events', async (route) => {
    const event = (slug: string, title: string, startAt: string, endAt?: string) => ({
      id: slug,
      collection: 'events',
      slug,
      title,
      status: 'published',
      sortOrder: 0,
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      data: {
        startAt,
        ...(endAt ? { endAt } : {}),
        timezone: 'Asia/Dubai',
        location: 'Dubai',
        format: 'in-person',
        desc: `${title} description`,
        sourceUrl: `https://example.com/${slug}`,
        images: [],
      },
    });
    await route.fulfill({
      json: {
        data: [
          event('future-event', 'Future Event', '2099-01-01T09:00:00+04:00'),
          event('ongoing-event', 'Ongoing Event', '2020-01-01T09:00:00+04:00', '2099-01-01T17:00:00+04:00'),
          event('ended-event', 'Ended Event', '2020-01-01T09:00:00+04:00', '2020-01-01T17:00:00+04:00'),
          {
            id: 'legacy-event',
            collection: 'events',
            slug: 'legacy-event',
            title: 'Legacy Event',
            status: 'published',
            sortOrder: 0,
            version: 1,
            createdAt: '2021-01-01T00:00:00.000Z',
            updatedAt: '2021-01-01T00:00:00.000Z',
            data: {
              year: '2021',
              date: '12 October',
              location: 'Dubai',
              desc: 'A previously published event.',
              stats: [{ label: 'Sessions', value: '1' }],
              images: ['/archive.jpg'],
            },
          },
        ],
      },
    });
  });

  await page.goto('/events');
  const upcoming = page.getByTestId('events-upcoming');
  const ended = page.getByTestId('events-ended');
  await expect(upcoming).toContainText('Future Event');
  await expect(upcoming).toContainText('Ongoing Event');
  await expect(upcoming).not.toContainText('Ended Event');
  await expect(ended).toContainText('Ended Event');
  await expect(ended).toContainText('Legacy Event');
  await expect(page.getByText('Transformation of the Healthcare industry and future outlook')).toHaveCount(0);
});

test('events show only the confirmation state when the API is unavailable', async ({ page }) => {
  await page.route('**/api/editorial?collection=events', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Temporarily unavailable' } }),
    });
  });

  await page.goto('/events');
  await expect(page.getByRole('heading', { name: 'Next dates will appear here.' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Future of Work Symposium')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /View Details/i })).toHaveCount(0);
});

test('the retired unsupported summit seed is not returned by the public events API', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:8080/api/editorial?collection=events');
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(Array.isArray(payload.data)).toBe(true);
  expect(payload.data).toEqual(
    expect.not.arrayContaining([
      expect.objectContaining({ slug: 'foundation-summit-2021' }),
    ]),
  );
});

test('a complete AI event result replaces a legacy draft and passes the save contract', () => {
  const generated = {
    startAt: '2026-10-01T18:30:00+04:00',
    endAt: '2026-10-01T20:00:00+04:00',
    timezone: 'Asia/Dubai',
    location: 'Dubai, United Arab Emirates',
    format: 'in-person',
    desc: 'An organizer-verified event.',
    sourceUrl: 'https://www.linkedin.com/events/example-123/',
    images: [],
  };
  const applied = applyEditorialAiData('events', {
    year: '2021',
    date: '12 October',
    stats: [{ label: 'Sessions', value: '24' }],
  }, generated);

  expect(applied).toEqual(generated);
  expect(validateEditorialWriteData('events', applied).success).toBe(true);
});

test('a new or AI-filled event never acquires an implicit format', () => {
  const initial = getInitialEditorialData('events');
  expect(initial).not.toHaveProperty('format');

  const applied = applyEditorialAiData('events', initial, {
    sourceUrl: 'https://www.linkedin.com/events/example-123/',
    images: [],
  });
  expect(applied).not.toHaveProperty('format');
  expect(validateEditorialWriteData('events', applied).success).toBe(true);
});

test('mobile navigation exposes separate Events and Talks links without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByTestId('button-mobile-history-back')).toBeVisible();
  await expect(page.getByTestId('button-mobile-history-forward')).toBeVisible();
  await page.getByRole('button', { name: 'Toggle menu' }).click();
  const menu = page.locator('#mobile-menu');
  await expect(menu.getByRole('link', { name: 'Events', exact: true })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Talks', exact: true })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Admin', exact: true })).toBeVisible();
  await menu.getByRole('link', { name: 'Talks', exact: true }).click();

  await expect(page).toHaveURL(/\/talks$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Ideas in action.' })).toBeVisible();
  await expect.poll(() =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  ).toBe(true);
});

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`editorial collections and details do not overflow horizontally on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);

    for (const route of editorialRoutes) {
      await page.goto(route.path);
      await expectNoHorizontalOverflow(page, route.label);
    }
  });
}

test('local editorial images load successfully across editorial routes', async ({ page }) => {
  const failures = editorialImageFailures(page);

  for (const path of ['/newsletters', '/communities', '/future-of-work/marketing?view=editorial', '/bigger-picture']) {
    await page.goto(path);
    await page.locator('img[src^="/editorial/"]').first().waitFor({ state: 'visible' });
    await page.waitForLoadState('networkidle');
  }

  expect(failures).toEqual([]);
});