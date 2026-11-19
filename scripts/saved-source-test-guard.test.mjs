import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSavedSourceTestEnvironment } from './saved-source-test-guard.mjs';

const development = {
  FUTURE_WORK_PREFLIGHT_TEST_DATABASE: 'development',
  DATABASE_URL: 'postgresql://fixture:unused@helium/heliumdb',
};
test('development confirmation is mandatory and does not permit remote or production databases', () => {
  assert.doesNotThrow(() => assertSavedSourceTestEnvironment(development));
  for (const change of [
    { FUTURE_WORK_PREFLIGHT_TEST_DATABASE: undefined },
    { NODE_ENV: 'production' },
    { REPLIT_DEPLOYMENT: '1' },
    { DATABASE_URL: 'postgresql://fixture:unused@production.example/heliumdb' },
    { DATABASE_URL: 'postgresql://fixture:unused@helium/production' },
    { DATABASE_URL: undefined },
  ]) {
    assert.throws(() => assertSavedSourceTestEnvironment({ ...development, ...change }));
  }
});