import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchpointRows, mentionsView, sourceRows, competitorRows, competitorInputs, validLink } from '../../assets/js/views/report-model.js';
import { createLibrary, safeStorage } from '../../assets/js/library.js';
import { memStorage } from '../helpers/mem-storage.js';

// safeStorage calls its getter on every access, so hand it one shared instance.
const memStore = (initial) => { const m = memStorage(initial); return safeStorage(() => m); };

const win = (days, total, extra = {}) => ({ days, total, capped: false, bySource: {}, top: [], weekly: [], ...extra });

test('touchpointRows labels statuses and drops unsafe links', () => {
  assert.deepEqual(touchpointRows({ score: 50, items: [
    { kind: 'website', url: 'https://acme.test/', status: 'live' },
    { kind: 'x', url: 'javascript:alert(1)', status: 'found' },
    { kind: 'instagram', url: 'https://instagram.com/acme', status: 'unverified' },
    { kind: 'tiktok', url: null, status: 'missing' },
    { kind: 'facebook', url: 'https://fb.test', status: 'broken' },
  ] }), [
    { label: 'Website', status: 'live', statusLabel: 'Live', tone: 'ok', href: 'https://acme.test/' },
    { label: 'X (Twitter)', status: 'found', statusLabel: 'Found on your site', tone: 'ok', href: null },
    { label: 'Instagram', status: 'unverified', statusLabel: 'Unverified', tone: 'warn', href: 'https://instagram.com/acme' },
    { label: 'TikTok', status: 'missing', statusLabel: 'Missing', tone: 'muted', href: null },
    { label: 'Facebook', status: 'broken', statusLabel: 'Broken', tone: 'bad', href: 'https://fb.test' },
  ]);
  assert.deepEqual(touchpointRows(null), []);
});

test('mentionsView picks the window and sorts sources', () => {
  const mentions = {
    d7: win(7, 2), d60: win(60, 100, { capped: true }),
    d30: win(30, 12, {
      bySource: { reddit: 2, 'google-news': 10 }, weekly: [1, 2, 3, 6],
      top: [{ date: '2026-10-05T00:00:00Z', source: 'reddit', title: 'Hi <b>', url: 'javascript:x' }],
    }),
  };
  const v = mentionsView(mentions, 30);
  assert.equal(v.big, '12');
  assert.deepEqual(v.bySource, [{ label: 'Google News', count: 10 }, { label: 'Reddit', count: 2 }]);
  assert.deepEqual(v.weekly, [1, 2, 3, 6]);
  assert.deepEqual(v.headlines, [{ title: 'Hi <b>', href: null, meta: 'Reddit · Oct 5, 2026' }]);
  assert.equal(mentionsView(mentions, 60).big, '100+');
  assert.equal(mentionsView(null, 7).big, '—');
});

test('sourceRows', () => {
  assert.deepEqual(sourceRows([{ source: 'news', ok: true, error: 'bing-news: HTTP 403' }, { source: 'website', ok: false, error: 'No website provided' }]), [
    { label: 'News', ok: true, detail: 'Partial: bing-news: HTTP 403' },
    { label: 'Website', ok: false, detail: 'No website provided' },
  ]);
});

test('competitorRows decides the action', () => {
  const library = createLibrary(memStore());
  const report = { id: 'P'.repeat(22), status: 'ok', competitors: [
    { name: 'Asana', website: 'https://asana.com', reason: 'r', coMentions: 3 },
    { name: 'Trello', website: null, reason: 'r2', coMentions: 1 },
  ] };
  library.upsert({ reportId: 'C'.repeat(22), reportKey: 'k'.repeat(43), name: 'Asana', type: 'competitor', parentId: report.id, createdAt: '2026-10-06T00:00:00Z', status: 'ok' });
  const withToken = competitorRows({ report, library, hasToken: true });
  assert.equal(withToken[0].action, 'open');
  assert.equal(withToken[0].existing.reportId, 'C'.repeat(22));
  assert.equal(withToken[0].host, 'asana.com');
  assert.equal(withToken[1].action, 'compare');
  assert.equal(competitorRows({ report, library, hasToken: false })[1].action, 'disabled');
});

test('competitorInputs inherits the parent industry', () => {
  const report = { id: 'P'.repeat(22), input: { industry: 'SaaS / Software' } };
  assert.deepEqual(competitorInputs(report, { name: 'Trello', website: null }), {
    name: 'Trello', website: '', industry: 'SaaS / Software', socials: {}, type: 'competitor', parentId: 'P'.repeat(22),
  });
});

test('validLink checks id and key shape', () => {
  assert.equal(validLink('P'.repeat(22), 'k'.repeat(43)), true);
  assert.equal(validLink('short', 'k'.repeat(43)), false);
  assert.equal(validLink('P'.repeat(22), 'k'.repeat(42)), false);
  assert.equal(validLink('P'.repeat(22), 'k'.repeat(42) + '+'), false);
  assert.equal(validLink(undefined, null), false);
});

test('touchpointRows tolerates malformed data', () => {
  assert.deepEqual(touchpointRows({ items: 'nope' }), []);
  assert.deepEqual(touchpointRows({ items: [null, 5, 'x'] }), []);
  const rows = touchpointRows({ items: [{ kind: 7, status: 'constructor', url: 'javascript:x' }, { status: 'toString' }] });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].label, '7');
  assert.equal(rows[0].statusLabel, 'constructor');
  assert.equal(rows[0].tone, 'muted');
  assert.equal(rows[0].href, null);
  assert.equal(typeof rows[1].label, 'string');
});

test('mentionsView tolerates malformed data', () => {
  const v = mentionsView({ d7: { total: 1, bySource: { reddit: 'x', hackernews: NaN, 'google-news': 3, __proto__x: 1 }, weekly: [1, 'a', null, 2], top: [null, 4, { title: 9, source: 'constructor', url: 'javascript:1', date: 'bad' }] } }, 7);
  assert.deepEqual(v.bySource, [{ label: 'Google News', count: 3 }, { label: '__proto__x', count: 1 }]);
  assert.deepEqual(v.weekly, [1, 2]);
  assert.equal(v.headlines.length, 1);
  assert.equal(v.headlines[0].title, '9');
  assert.equal(v.headlines[0].href, null);
  assert.equal(v.headlines[0].meta, 'constructor · —');
  const bad = mentionsView({ d30: { total: 1, bySource: 'x', weekly: 'x', top: 'x' } }, 30);
  assert.deepEqual([bad.bySource, bad.weekly, bad.headlines], [[], [], []]);
  assert.equal(mentionsView('str', 30).big, '—');
});

test('sourceRows tolerates malformed data', () => {
  assert.deepEqual(sourceRows(null), []);
  assert.deepEqual(sourceRows('x'), []);
  assert.deepEqual(sourceRows([null, 3, { source: 'constructor', ok: false }]), [{ label: 'constructor', ok: false, detail: 'Failed' }]);
});

test('competitorRows tolerates malformed data', () => {
  const library = createLibrary(memStore());
  assert.deepEqual(competitorRows({ report: null, library, hasToken: true }), []);
  assert.deepEqual(competitorRows({ report: { id: 'P'.repeat(22), competitors: 'x' }, library, hasToken: true }), []);
  const rows = competitorRows({ report: { id: 'P'.repeat(22), competitors: [null, { name: 5 }, { name: 'Ok', website: 'javascript:x', reason: 3 }] }, library, hasToken: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].href, null);
  assert.equal(rows[0].host, '');
  assert.equal(rows[0].reason, '');
  assert.equal(rows[0].action, 'compare');
});

test('competitorInputs tolerates missing industry', () => {
  assert.equal(competitorInputs({ id: 'P'.repeat(22) }, { name: 'X' }).industry, '');
});
