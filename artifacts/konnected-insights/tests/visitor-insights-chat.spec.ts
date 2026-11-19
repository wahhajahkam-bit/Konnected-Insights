import { expect, test, type Page, type Request } from '@playwright/test';
import { CHAT_UNAVAILABLE } from '../src/components/insights-chat-response';

const invalidResponses = [
  { name: 'HTML success', status: 200, contentType: 'text/html', body: '<!DOCTYPE html><html>Fallback</html>' },
  { name: 'HTML failure', status: 502, contentType: 'text/html', body: '<!DOCTYPE html><html>Unavailable</html>' },
  { name: 'malformed JSON', status: 200, contentType: 'application/json', body: '{"data":' },
  { name: 'empty JSON', status: 200, contentType: 'application/json', body: '' },
  ...[null, {}, { data: { answer: 42, sources: [] } }, { data: { answer: 'Answer', sources: [null] } },
    { data: { answer: 'Answer', sources: [], degraded: 'yes' } },
    { error: { code: 'UNAVAILABLE', message: '<html>Failure</html>' } },
  ].map((payload, index) => ({ name: `invalid payload ${index}`, status: 200, contentType: 'application/json', body: JSON.stringify(payload) })),
];

for (const failure of invalidResponses) {
  test(`recovers from ${failure.name} without duplicating the question`, async ({ page }) => {
    const questions: string[] = [];
    await page.route('**/api/insights-chat', route => {
      questions.push(route.request().postDataJSON().question);
      return route.fulfill(questions.length === 1 ? failure : { json: response });
    });
    await page.goto('/');
    await openChat(page);
    await page.getByTestId('button-starter-question-1').click();
    await expect(page.getByText(CHAT_UNAVAILABLE, { exact: true })).toBeVisible();
    await expect(page.getByTestId('input-chat-question')).toBeEnabled();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText(response.data.answer)).toBeVisible();
    expect(questions).toEqual(['Find a masterclass for leaders', 'Find a masterclass for leaders']);
    await expect(page.getByText('Find a masterclass for leaders', { exact: true })).toHaveCount(1);
    await expect(page.getByTestId('status-chat-loading')).toHaveCount(0);
  });
}

test('network failure uses a friendly message', async ({ page }) => {
  await page.route('**/api/insights-chat', route => route.abort('failed'));
  await page.goto('/');
  await openChat(page);
  await page.getByTestId('button-starter-question-1').click();
  await expect(page.getByText(CHAT_UNAVAILABLE, { exact: true })).toBeVisible();
  await expect(page.getByTestId('input-chat-question')).toBeEnabled();
});

const response = {
  data: {
    answer: 'Start with the Future of Work collection, then explore its evidence.',
    sources: [
      {
        id: 'future-work',
        title: 'Future of Work',
        url: '/future-of-work',
        date: '2026-01-15',
      },
    ],
  },
};

async function openChat(page: Page) {
  await page.getByTestId('button-open-chat').click();
  await expect(page.getByRole('dialog', { name: 'Insights Guide' })).toBeVisible();
}

test('is keyboard accessible, closes with Escape, and restores trigger focus', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByTestId('button-open-chat');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('input-chat-question')).toBeFocused();

  const firstControl = page.getByTestId('button-close-chat');
  const lastControl = page.getByTestId('button-send-chat');
  await page.getByTestId('input-chat-question').fill('Keyboard focus check');
  await lastControl.focus();
  await page.keyboard.press('Tab');
  await expect(firstControl).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(lastControl).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('panel-insights-chat')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('fits a small mobile viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await openChat(page);
  await expect.poll(() =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(0);
  await expect(page.getByTestId('panel-insights-chat')).toBeInViewport();
});

test('mobile launcher and panel clear the Future of Work function navigation', async ({ page }) => {
  const slug = 'chat-overlap-test';
  await page.route(`**/api/future-work/functions/${slug}`, route =>
    route.fulfill({
      json: {
        data: {
          function: {
            id: '11111111-1111-4111-8111-111111111111',
            slug,
            name: 'Operations',
            description: 'How operating models may change.',
            sortOrder: 1,
            enabled: true,
            revision: 1,
            presentation: {},
          },
          content: [],
          programs: [],
          news: [],
          skills: [],
        },
      },
    }),
  );
  await page.route(`**/api/editorial/future-work/${slug}`, route =>
    route.fulfill({ status: 404, json: { error: { message: 'No legacy profile' } } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/future-of-work/${slug}`);

  const nav = page.getByTestId('mobile-function-nav');
  const launcher = page.getByTestId('button-open-chat');
  await expect(nav).toBeVisible();
  await expect(launcher).toBeVisible();
  await expect.poll(async () => {
    const navBox = await nav.boundingBox();
    const launcherBox = await launcher.boundingBox();
    if (!navBox || !launcherBox) return -1;
    return navBox.y - (launcherBox.y + launcherBox.height);
  }).toBeGreaterThanOrEqual(15);

  await launcher.click();
  const panel = page.getByTestId('panel-insights-chat');
  await expect(panel).toBeInViewport();
  await expect.poll(async () => {
    const navBox = await nav.boundingBox();
    const panelBox = await panel.boundingBox();
    if (!navBox || !panelBox) return -1;
    return navBox.y - (panelBox.y + panelBox.height);
  }).toBeGreaterThanOrEqual(15);
});

test('keeps the conversation and follow-up history across public route navigation', async ({ page }) => {
  const requests: Request[] = [];
  await page.route('**/api/insights-chat', async route => {
    requests.push(route.request());
    await route.fulfill({ json: response });
  });
  await page.goto('/');
  await openChat(page);
  await page.getByTestId('input-chat-question').fill('Where should I begin?');
  await page.getByTestId('button-send-chat').click();
  await expect(page.getByText(response.data.answer)).toBeVisible();

  await page.getByTestId('link-chat-source-future-work').click();
  await expect(page).toHaveURL(/\/future-of-work$/);
  await expect(page.getByText(response.data.answer)).toBeVisible();
  await page.getByTestId('input-chat-question').fill('What should I read next?');
  await page.getByTestId('button-send-chat').click();
  await expect.poll(() => requests.length).toBe(2);
  const followup = requests[1].postDataJSON() as {
    question: string;
    history: { role: string; content: string }[];
  };
  expect(followup.question).toBe('What should I read next?');
  expect(followup.history).toEqual([
    { role: 'user', content: 'Where should I begin?' },
    { role: 'assistant', content: response.data.answer },
  ]);
});

test('is public-only and hidden from admin and authentication routes', async ({ page }) => {
  for (const path of ['/admin', '/sign-in', '/sign-up']) {
    await page.goto(path);
    await expect(page.getByTestId('button-open-chat')).toHaveCount(0);
  }
  await page.goto('/newsletters');
  await expect(page.getByTestId('button-open-chat')).toBeVisible();
});

test('uses Wouter destinations for canonical public content routes', async ({ page }) => {
  const canonicalSources = [
    { id: 'newsletters', title: 'Newsletters', url: '/newsletters' },
    { id: 'masterclass', title: 'Masterclass', url: '/masterclass-series/leading-through-change' },
    { id: 'contributor', title: 'Contributor', url: '/contributors/anne-marie-thodsen' },
    { id: 'community', title: 'Community', url: '/communities' },
    { id: 'event', title: 'Event', url: '/events/future-leadership-summit' },
    { id: 'talks', title: 'Talks', url: '/talks' },
    { id: 'future-editorial', title: 'Future of Work editorial', url: '/future-of-work?view=editorial' },
    { id: 'future-function', title: 'Future of Work function', url: '/future-of-work/operations' },
  ];
  await page.route('**/api/insights-chat', route =>
    route.fulfill({
      json: { data: { ...response.data, sources: canonicalSources } },
    }),
  );
  await page.goto('/');
  await openChat(page);
  await page.getByTestId('button-starter-question-2').click();

  for (const source of canonicalSources) {
    const link = page.getByTestId(`link-chat-source-${source.id}`);
    await expect(link).toHaveAttribute('href', source.url);
    await expect(link).not.toHaveAttribute('target', '_blank');
  }
});

test('does not make invalid or off-site source URLs clickable', async ({ page }) => {
  const unsafeSources = [
    { id: 'javascript', title: 'Unsafe script', url: 'javascript:alert(1)' },
    { id: 'offsite', title: 'Unexpected off-site result', url: 'https://example.com/research' },
    { id: 'protocol-relative', title: 'Protocol-relative result', url: '//example.com/research' },
    { id: 'api', title: 'API route', url: '/api/private' },
  ];
  await page.route('**/api/insights-chat', route =>
    route.fulfill({
      json: { data: { ...response.data, sources: unsafeSources } },
    }),
  );
  await page.goto('/');
  await openChat(page);
  await page.getByTestId('button-starter-question-0').click();

  for (const source of unsafeSources) {
    await expect(page.getByTestId(`link-chat-source-${source.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`text-chat-source-invalid-${source.id}`)).toContainText('Link unavailable');
  }
});

test('shows useful errors and retries the same question', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/insights-chat', route => {
    attempts += 1;
    if (attempts === 1) {
      return route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', message: 'The research index is briefly unavailable.' } },
      });
    }
    return route.fulfill({ json: response });
  });
  await page.goto('/');
  await openChat(page);
  await page.getByTestId('input-chat-question').fill('Find research about leadership');
  await page.getByTestId('button-send-chat').click();
  await expect(page.getByText('The research index is briefly unavailable.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText(response.data.answer)).toBeVisible();
  expect(attempts).toBe(2);
});

test('retains retrieved links while offering retry for degraded replies', async ({ page }) => {
  await page.route('**/api/insights-chat', route =>
    route.fulfill({ json: { data: { ...response.data, degraded: true } } }),
  );
  await page.goto('/');
  await openChat(page);
  await page.getByTestId('button-starter-question-0').click();
  await expect(page.getByTestId('status-degraded')).toBeVisible();
  await expect(page.getByTestId('link-chat-source-future-work')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('clears the retained conversation history', async ({ page }) => {
  await page.route('**/api/insights-chat', route => route.fulfill({ json: response }));
  await page.goto('/');
  await openChat(page);
  await page.getByTestId('button-starter-question-0').click();
  await expect(page.getByText(response.data.answer)).toBeVisible();
  await page.getByTestId('button-clear-chat').click();
  await expect(page.getByTestId('chat-welcome')).toBeVisible();
  await expect(page.getByText(response.data.answer)).toHaveCount(0);
});