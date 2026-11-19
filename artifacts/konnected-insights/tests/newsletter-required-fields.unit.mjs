import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newsletterRequiredFieldIssues } from '../src/lib/newsletter-required-fields.ts';
import { applyEditorialAiData } from '../src/lib/editorial-ai-apply.ts';

test('absent newsletter metadata no longer blocks save or publish', () => {
  for (const data of [{}, null, { author: {} }, { author: null }, {
    category: '', excerpt: ' ', url: '', image: '', author: { name: '', image: '' },
  }]) assert.deepEqual(newsletterRequiredFieldIssues(data), []);
});

test('supplied links and images remain validated and can be cleared', () => {
  for (const url of ['/relative', 'https://', 'ftp://example.com/newsletter', 'not a url']) {
    assert.deepEqual(newsletterRequiredFieldIssues({ url }).map(issue => issue.path), [['url']]);
  }
  for (const image of ['cover.jpg', '//example.com/cover.jpg', 'javascript:alert(1)']) {
    assert.deepEqual(newsletterRequiredFieldIssues({ image }).map(issue => issue.path), [['image']]);
  }
  assert.deepEqual(newsletterRequiredFieldIssues({ image: '/cover.jpg', url: 'https://example.com/article' }), []);
  assert.deepEqual(newsletterRequiredFieldIssues({ author: { image: 'invalid' } }).map(issue => issue.path), [['author', 'image']]);
  assert.deepEqual(newsletterRequiredFieldIssues({ author: { image: '' } }), []);
});

test('incomplete AI suggestions remain saveable without invented bylines or photos', () => {
  const applied = applyEditorialAiData('newsletters', {}, { excerpt: 'Source text' });
  assert.deepEqual(applied, { excerpt: 'Source text' });
  assert.deepEqual(newsletterRequiredFieldIssues(applied), []);
});