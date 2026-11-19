/**
 * These fixture-writing regressions are deliberately limited to the local
 * Replit development database. Confirmation alone must not authorize a remote DB.
 * Never print connection strings or credentials when rejecting a target.
 */
export function assertSavedSourceTestEnvironment(env = process.env) {
  if (env.FUTURE_WORK_PREFLIGHT_TEST_DATABASE !== 'development') {
    throw new Error('Caller must explicitly confirm FUTURE_WORK_PREFLIGHT_TEST_DATABASE=development');
  }
  if (env.NODE_ENV === 'production' || env.REPLIT_DEPLOYMENT === '1') {
    throw new Error('Saved-source regression fixtures are forbidden in production');
  }
  let database;
  try {
    database = new URL(env.DATABASE_URL);
  } catch {
    throw new Error('A local development DATABASE_URL is required');
  }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)
    || !['helium', 'localhost', '127.0.0.1', '[::1]'].includes(database.hostname)
    || database.pathname !== '/heliumdb') {
    throw new Error('Saved-source regressions only allow the local heliumdb development database');
  }
}