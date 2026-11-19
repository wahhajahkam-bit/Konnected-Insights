import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { assertSavedSourceTestEnvironment } from './saved-source-test-guard.mjs';

assertSavedSourceTestEnvironment();
if (!process.env.REPLIT_DEV_DOMAIN) {
  throw new Error('Authenticated regressions require the Replit development preview');
}
const env = {
  ...process.env,
  FUTURE_WORK_LIVE: '1',
  NEWSLETTER_LIVE_AI: '1',
  NEWSLETTER_DEV_DATABASE_CONFIRMED: '1',
  NEWSLETTER_BASE_URL: `https://${process.env.REPLIT_DEV_DOMAIN}`,
};
if (!env.NEWSLETTER_CHROMIUM_EXECUTABLE_PATH && existsSync('/repl/tools/bin/chromium')) {
  env.NEWSLETTER_CHROMIUM_EXECUTABLE_PATH = '/repl/tools/bin/chromium';
}
// The API and web managed workflows must be running before this explicit,
// fixture-writing development workflow is started.
for (const args of [
  ['exec', 'node', '--test', 'scripts/saved-source-test-guard.test.mjs'],
  ['--filter', '@workspace/api-server', 'run', 'test:future-work-preflight-integration'],
  ['--filter', '@workspace/api-server', 'run', 'test:future-work-history-integration'],
  ['--filter', '@workspace/konnected-insights', 'exec', 'playwright', 'test',
    '--project', 'future-work-live', '--grep', 'saved-source preflight isolates|history live regression:',
    '--workers=1', '--retries=0'],
]) {
  const result = spawnSync('pnpm', args, { env, stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}