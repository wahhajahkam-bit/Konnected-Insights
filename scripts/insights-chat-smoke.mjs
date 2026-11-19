import assert from 'node:assert/strict';

// Deliberately opt-in: exercises the real model and the existing anonymous budget.
assert(process.env.REPLIT_DEV_DOMAIN, 'Run inside the development workspace.');
assert.notEqual(process.env.NODE_ENV, 'production', 'Development smoke test only.');
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const response = await fetch(`${origin}/api/insights-chat`, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: 'Find a masterclass for leaders' }),
  signal: AbortSignal.timeout(40_000),
});
console.log(`Shared-origin chat: HTTP ${response.status}, ${response.headers.get('content-type')}, redirect=${response.headers.get('location') ?? 'none'}`);
assert.equal(response.status, 200);
assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/);
const { data } = await response.json();
assert.equal(typeof data?.answer, 'string');
assert(data.answer.trim());
assert(Array.isArray(data.sources));
for (const source of data.sources) {
  assert.equal(typeof source.title, 'string');
  const url = new URL(source.url, origin);
  assert.equal(url.origin, origin);
  assert(!url.pathname.startsWith('/api'));
  const page = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  assert.equal(page.status, 200, `Source destination: ${url.pathname}`);
}
console.log(JSON.stringify(data, null, 2));