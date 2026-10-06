import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../helpers/fake-dom.js';

const restore = installFakeDom();
const { renderLoading, renderReport } = await import('../../assets/js/views/report.js');
const { createLibrary, safeStorage } = await import('../../assets/js/library.js');
const { memStorage } = await import('../helpers/mem-storage.js');
test.after(restore);

const root = () => ({ kids: [], append(...n) { this.kids.push(...n); } });
const text = (n) => n.textContent ?? '';

test('renderLoading rejects malformed id/key without fetching', async () => {
  let fetched = 0;
  const r = root();
  let ready = 0;
  await renderLoading(r, { id: 'bad', key: 'k'.repeat(43), ctx: { fetchText: async () => { fetched++; return null; } }, onReady: () => { ready++; } });
  assert.equal(fetched, 0);
  assert.equal(ready, 0);
  assert.match(text(r.kids[0]), /can't be opened/);
});

test('renderLoading does not touch root once aborted', async () => {
  const ac = new AbortController();
  const r = root();
  await renderLoading(r, { id: 'P'.repeat(22), key: 'k'.repeat(43), ctx: { fetchText: async () => { ac.abort(); throw new Error('HTTP 500'); } }, signal: ac.signal, onReady: () => assert.fail() });
  assert.equal(r.kids.length, 0);
});

test('renderReport never throws on malformed report data', () => {
  globalThis.location ??= { origin: 'https://x.test', pathname: '/' };
  const m = memStorage();
  const library = createLibrary(safeStorage(() => m));
  const r = root();
  const report = {
    id: 'P'.repeat(22), status: 'ok', mode: 'rules', input: { name: 5, website: 'javascript:x' },
    positioning: { differentiators: 'x', tags: [1, null, 'a'], phrases: {}, newsSentiment: 'constructor', statement: 7 },
    touchpoints: { score: 'x', items: [null, { kind: 'x', status: 'live', url: 'javascript:1' }], expected: 'x' },
    mentions: { d30: { total: 1, bySource: 'x', weekly: 'x', top: [null] } },
    competitors: [null, { name: 'A', website: 'javascript:1' }], sources: [null],
  };
  renderReport(r, report, 'k'.repeat(43), { library, github: null }, undefined);
  assert.ok(r.kids.length >= 5);
});
