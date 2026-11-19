import assert from 'node:assert/strict';
import { test } from 'node:test';
import { functionIntroduction } from '../src/lib/future-work-introduction.ts';

const fn = { slug: 'finance', name: 'Finance', description: '', presentation: {} };
test('long unsaved overview copy is displayed in full without changing the draft', () => {
  const overview = Array.from({ length: 100 }, (_, index) => `Editorial consideration ${index} matters.`).join(' ');
  const draft = { ...fn, presentation: { shortIntroduction: 'Financial stewardship.', sectionIntroductions: { overview } } };
  const before = JSON.stringify(draft);
  assert.deepEqual(functionIntroduction(draft), ['Financial stewardship.', overview]);
  assert.equal(JSON.stringify(draft), before);
});
test('all seven functions have distinct relevant fallback framing', () => {
  const slugs = ['finance', 'marketing', 'hr', 'operations', 'sales', 'technology-it', 'grc'];
  const copy = slugs.map(slug => functionIntroduction({ ...fn, slug }).join(' '));
  assert.equal(new Set(copy).size, 7);
  for (const text of copy) {
    assert.ok(text.length > 60);
    assert.doesNotMatch(text, /Choose a time horizon|will /);
  }
});
test('missing fields and unknown functions have safe name-based framing', () => {
  assert.match(functionIntroduction({ slug: 'legal', name: 'Legal' }).join(' '), /For Legal, the focus/);
  assert.deepEqual(functionIntroduction({ ...fn, description: '  ', presentation: { shortIntroduction: ' ' } }), functionIntroduction(fn));
});
test('saved subheading and unique overview are preserved without duplicating sentences', () => {
  const original = { ...fn, description: 'Older description.', presentation: {
    shortIntroduction: 'Financial stewardship.',
    sectionIntroductions: { overview: 'Financial stewardship. Accountable decisions matter.' },
  } };
  assert.deepEqual(functionIntroduction(original), ['Financial stewardship.', 'Accountable decisions matter.']);
  assert.equal(original.presentation.sectionIntroductions.overview, 'Financial stewardship. Accountable decisions matter.');
});
test('duplicate description and overview appear once, preserving editorial copy', () => {
  assert.deepEqual(functionIntroduction({ ...fn, description: 'Financial stewardship.', presentation: {
    sectionIntroductions: { overview: 'Financial stewardship.' },
  } }), ['Financial stewardship.']);
});
test('a distinct saved description remains after the short introduction when overview is absent', () => {
  assert.deepEqual(functionIntroduction({ ...fn, description: 'Accountable financial planning.', presentation: {
    shortIntroduction: 'Financial stewardship.',
  } }), ['Financial stewardship.', 'Accountable financial planning.']);
});
test('description fallback removes only overlap with the short introduction', () => {
  assert.deepEqual(functionIntroduction({ ...fn, description: 'Financial stewardship. Accountable decisions matter.', presentation: {
    shortIntroduction: 'Financial stewardship.',
    sectionIntroductions: { overview: 'Choose a time horizon to read the available published research.' },
  } }), ['Financial stewardship.', 'Accountable decisions matter.']);
});
test('boilerplate is replaced while meaningful adjacent editorial text survives', () => {
  const result = functionIntroduction({ ...fn, presentation: {
    shortIntroduction: 'Explore the future of finance through technology, professional practice and three time horizons.',
    sectionIntroductions: { overview: 'Choose a time horizon to read the available published research. Capital allocation matters.' },
  } });
  assert.deepEqual(result, ['Capital allocation matters.']);
});
test('case and whitespace duplicates do not repeat and get useful fallback context', () => {
  const result = functionIntroduction({ ...fn, presentation: {
    shortIntroduction: 'Financial stewardship.',
    sectionIntroductions: { overview: ' FINANCIAL   STEWARDSHIP. ' },
  } });
  assert.equal(result[0], 'Financial stewardship.');
  assert.equal(result.length, 2);
  assert.match(result[1], /capital allocation/);
});