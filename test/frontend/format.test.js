import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, mentionsLabel, safeHref, displayHost, kindLabel, compareRows } from '../../assets/js/format.js';

test('formatters', () => {
  assert.equal(formatDate('2026-10-06T23:30:00Z'), 'Oct 6, 2026');
  assert.equal(formatDate('nope'), '—');
  assert.equal(mentionsLabel({ total: 12, capped: false }), '12');
  assert.equal(mentionsLabel({ total: 100, capped: true }), '100+');
  assert.equal(mentionsLabel(null), '—');
  assert.equal(displayHost('https://www.acme.com/x'), 'acme.com');
  assert.equal(kindLabel('x'), 'X (Twitter)');
  assert.equal(kindLabel('mastodon'), 'mastodon');
});

test('safeHref allows only http(s) (Review Focus #1)', () => {
  assert.equal(safeHref('https://a.test/x'), 'https://a.test/x');
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref('JaVaScRiPt:alert(1)'), null);
  assert.equal(safeHref('data:text/html,<script>'), null);
  assert.equal(safeHref(undefined), null);
});

const rep = (over = {}) => ({
  status: 'ok',
  positioning: { statement: 'S', audience: null, tags: ['premium'], phrases: ['a', 'b'] },
  touchpoints: { score: 50 },
  mentions: { d7: { total: 1, capped: false }, d30: { total: 5, capped: false }, d60: { total: 100, capped: true } },
  ...over,
});

test('compareRows aligns values and marks differences', () => {
  const rows = compareRows(rep(), rep({ touchpoints: { score: 80 }, positioning: { statement: 'S', audience: 'Teams', tags: [], phrases: ['a', 'b'] } }));
  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.deepEqual(rows.map((r) => r.label), ['Positioning', 'Audience', 'Archetypes', 'Touchpoint score', 'Mentions — 7 days', 'Mentions — 30 days', 'Mentions — 60 days', 'Top phrases']);
  assert.deepEqual(by['Positioning'], { label: 'Positioning', a: 'S', b: 'S', diff: false, better: null });
  assert.deepEqual(by['Audience'], { label: 'Audience', a: '—', b: 'Teams', diff: true, better: null });
  assert.deepEqual(by['Touchpoint score'], { label: 'Touchpoint score', a: '50/100', b: '80/100', diff: true, better: 'b' });
  assert.equal(by['Mentions — 60 days'].a, '100+');
  assert.equal(by['Mentions — 7 days'].better, null);
});

test('compareRows tolerates a failed report', () => {
  const rows = compareRows(rep(), { status: 'failed', positioning: null, touchpoints: null, mentions: null });
  assert.ok(rows.every((r) => r.b === '—'));
  assert.ok(rows.every((r) => r.better === null));
});
