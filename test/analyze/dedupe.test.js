import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeMentions, jaccard, titleTokens } from '../../collector/analyze/dedupe.mjs';

const m = (date, url, title, source = 'google-news') => ({ date, url, title, source });

test('jaccard of token sets', () => {
  assert.equal(jaccard(titleTokens('Acme raises money'), titleTokens('acme RAISES money!')), 1);
  assert.equal(jaccard(new Set(), new Set(['a'])), 0);
});

test('dedupes by normalized url, then by similar title, newest first', () => {
  const out = dedupeMentions([
    m('2026-10-01T00:00:00Z', 'https://www.a.test/x?utm_source=t', 'Acme raises Series B funding round today'),
    m('2026-10-02T00:00:00Z', 'https://a.test/x/', 'Acme raises Series B funding round today'),
    m('2026-10-03T00:00:00Z', 'https://b.test/y', 'Acme raises Series B funding round today!'),
    m('2026-09-01T00:00:00Z', 'https://c.test/z', 'Totally different headline about Acme'),
  ]);
  assert.deepEqual(out.map((x) => x.url), ['https://b.test/y', 'https://c.test/z']);
});
