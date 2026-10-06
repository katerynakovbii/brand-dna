import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POLL_TIMEOUT_MS, recordResult, isStale } from '../../assets/js/analysis.js';
import { createContext } from '../../assets/js/context.js';
import { createLibrary, safeStorage } from '../../assets/js/library.js';
import { resolveIndustry } from '../../collector/industries.mjs';
import { newReportId, generateReportKey } from '../../shared/crypto.js';
import { memStorage } from '../helpers/mem-storage.js';

const ID = 'a'.repeat(22);
const loc = { hostname: 'o.github.io', pathname: '/r/', href: 'https://o.github.io/r/#/' };

function recorder(responder) {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => { calls.push(url); return responder(url, init); } };
}

test('poll timeout is 15 minutes and isStale honours it', () => {
  assert.equal(POLL_TIMEOUT_MS, 15 * 60 * 1000);
  const createdAt = '2026-10-06T00:00:00Z';
  assert.equal(isStale({ status: 'running', createdAt }, Date.parse('2026-10-06T00:14:00Z')), false);
  assert.equal(isStale({ status: 'running', createdAt }, Date.parse('2026-10-06T00:16:00Z')), true);
});

test('recordResult keeps the competitor link when a bare failure report has no parent', () => {
  const s = memStorage();
  const library = createLibrary(safeStorage(() => s));
  const id = newReportId();
  const parentId = newReportId();
  const key = generateReportKey();
  library.upsert({ reportId: id, reportKey: key, name: 'Rival', type: 'competitor', parentId, createdAt: '2026-10-06T00:00:00.000Z', status: 'running' });
  const e = recordResult(library, { id, status: 'failed', type: 'main', parentId: null, input: null, createdAt: '2026-10-06T00:02:00.000Z' }, key);
  assert.equal(e.type, 'competitor');
  assert.equal(e.parentId, parentId);
  assert.equal(e.status, 'failed');
  assert.equal(library.get(id).parentId, parentId);
});

test('rejected stored token falls back to the public fetch and never leaks the token', async () => {
  const s = memStorage({ 'brand-dna:token': 'secret-tok' });
  const { calls, fetchImpl } = recorder((url) =>
    url.startsWith('https://api.github.com') ? new Response('', { status: 401 }) : new Response('cipher'));
  const ctx = createContext({ loc, fetchImpl, storage: safeStorage(() => s) });
  assert.equal(await ctx.fetchText(ID), 'cipher');
  assert.equal(calls.length, 2);
  assert.equal(calls[1], `https://o.github.io/r/reports/${ID}.enc`);
  assert.ok(!calls.join('\n').includes('secret-tok'));
});

test('non-auth errors with a token still surface', async () => {
  const s = memStorage({ 'brand-dna:token': 'secret-tok' });
  const { fetchImpl } = recorder(() => new Response('', { status: 500 }));
  const ctx = createContext({ loc, fetchImpl, storage: safeStorage(() => s) });
  await assert.rejects(ctx.fetchText(ID), (e) => e.message === 'GitHub API error 500');
});

test('resolveIndustry ignores inherited object properties', () => {
  for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) assert.equal(resolveIndustry(k), 'default');
  assert.equal(resolveIndustry('constructor', { constructor: { label: 'X' } }), 'constructor');
});
