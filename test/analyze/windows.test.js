import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketMentions } from '../../collector/analyze/windows.mjs';

const now = new Date('2026-10-06T00:00:00Z');
const at = (daysAgo, source = 'google-news') => ({
  date: new Date(now.getTime() - daysAgo * 86400000).toISOString(), source, title: `t${daysAgo}`, url: `https://n.test/${daysAgo}`,
});

test('buckets into 7/30/60 with sources, weekly series and top list', () => {
  const items = [at(1), at(3, 'reddit'), at(10), at(29, 'hackernews'), at(45), at(59.5), at(70)];
  const w = bucketMentions(items, { now });
  assert.equal(w.d7.total, 2);
  assert.equal(w.d30.total, 4);
  assert.equal(w.d60.total, 6);
  assert.deepEqual(w.d30.bySource, { 'google-news': 2, reddit: 1, hackernews: 1 });
  assert.equal(w.d7.weekly.length, 1);
  assert.deepEqual(w.d7.weekly, [2]);
  assert.equal(w.d60.weekly.length, 9);
  assert.equal(w.d60.weekly.at(-1), 2, 'newest week last');
  assert.equal(w.d60.weekly.reduce((a, b) => a + b, 0), 6);
  assert.equal(w.d60.top[0].title, 't1');
  assert.equal(w.d7.capped, false);
});

test('future-dated items count as today; caps propagate', () => {
  const w = bucketMentions([{ ...at(0), date: '2026-10-06T08:00:00Z' }], { now, capped: { 'google-news': true } });
  assert.equal(w.d7.total, 1);
  assert.equal(w.d7.capped, true);
  assert.equal(w.d60.capped, true);
});

test('top list limited to 10', () => {
  const w = bucketMentions(Array.from({ length: 15 }, (_, i) => at(i * 0.1)), { now });
  assert.equal(w.d7.top.length, 10);
});
