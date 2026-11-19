import { defineConfig, devices } from '@playwright/test';
import { assertSavedSourceTestEnvironment } from '../../scripts/saved-source-test-guard.mjs';

const liveNewsletter = process.env.NEWSLETTER_LIVE_AI === '1';
const liveFutureWork = process.env.FUTURE_WORK_LIVE === '1';
const cleanupNewsletter = Boolean(process.env.NEWSLETTER_CLEANUP_RUN_ID);
const developmentOrigin = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : undefined;

if (!liveNewsletter && !liveFutureWork) {
  // Apply the same local-only DB boundary before either starting or reusing
  // the API. Ordinary CI must never target a deployment or remote database.
  assertSavedSourceTestEnvironment({
    ...process.env,
    FUTURE_WORK_PREFLIGHT_TEST_DATABASE: 'development',
  });
}

if ((liveNewsletter || liveFutureWork) && (
  !developmentOrigin ||
  process.env.NEWSLETTER_BASE_URL !== developmentOrigin ||
  process.env.NEWSLETTER_DEV_DATABASE_CONFIRMED !== '1' ||
  process.env.NODE_ENV === 'production'
)) {
  throw new Error('Live development tests require the exact Replit development origin and explicit development database confirmation.');
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/*.live.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    ...(liveNewsletter ? [{
      name: cleanupNewsletter ? 'newsletter-cleanup' : 'newsletter-live',
      testMatch: cleanupNewsletter ? '**/newsletter-cleanup.live.spec.ts' : '**/newsletter-draft.live.spec.ts',
      fullyParallel: false,
      retries: 0,
      timeout: 240_000,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: developmentOrigin,
        // Authentication material must never be retained in traces/HAR/video.
        trace: 'off' as const,
        screenshot: 'off' as const,
        video: 'off' as const,
        launchOptions: process.env.NEWSLETTER_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.NEWSLETTER_CHROMIUM_EXECUTABLE_PATH }
          : {},
      },
    }] : []),
    ...(liveFutureWork ? [{
      name: 'future-work-live',
      testMatch: '**/future-work.live.spec.ts',
      fullyParallel: false,
      retries: 0,
      timeout: 240_000,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: developmentOrigin,
        // The single-use Clerk ticket must never be retained in test artifacts.
        trace: 'off' as const,
        screenshot: 'off' as const,
        video: 'off' as const,
        launchOptions: process.env.NEWSLETTER_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.NEWSLETTER_CHROMIUM_EXECUTABLE_PATH }
          : {},
      },
    }] : []),
  ],
  webServer: liveNewsletter || liveFutureWork ? undefined : [{
    command: 'pnpm --filter @workspace/api-server run test:serve',
    env: {
      NODE_ENV: 'development',
      PORT: '8080',
    },
    // Unlike the dedicated Vite test server, the API may be managed by Replit.
    // Playwright only tears down the process it starts, not a reused service.
    reuseExistingServer: true,
    timeout: 120_000,
    url: 'http://127.0.0.1:8080/api/editorial?collection=events',
  }, {
    command: 'pnpm run dev',
    env: {
      BASE_PATH: '/',
      PORT: '4173',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: 'http://127.0.0.1:4173',
  }],
});