import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesResearchFilter } from '../src/pages/admin-components/research-history-filter.ts';

test('research history scopes by function and horizon/category without dropping outcomes', () => {
  for (const outcome of ['published', 'unchanged', 'nothing_found', 'failed', 'skipped', 'draft_created']) {
    const result = { combination: { functionId: 'finance', kind: 'content', horizon: 2050 }, outcome };
    assert.equal(matchesResearchFilter(result, 'finance', '2050'), true);
    assert.equal(matchesResearchFilter(result, 'finance', '2030'), false);
    assert.equal(matchesResearchFilter(result, 'operations', '2050'), false);
    assert.equal(matchesResearchFilter(result, '', 'all'), true);
  }
});

test('news/program categories and legacy records retain honest filtering', () => {
  for (const kind of ['news', 'programs']) {
    const result = { combination: { functionId: 'finance', kind } };
    assert.equal(matchesResearchFilter(result, '', kind), true);
    assert.equal(matchesResearchFilter(result, 'finance', 'all'), true);
    assert.equal(matchesResearchFilter(result, '', '2030'), false);
  }
  assert.equal(matchesResearchFilter('Legacy result', '', 'all'), true);
  assert.equal(matchesResearchFilter('Legacy result', 'finance', 'all'), false);
});