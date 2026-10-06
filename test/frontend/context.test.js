import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../../assets/js/context.js';
import { safeStorage } from '../../assets/js/library.js';
import { memStorage } from '../helpers/mem-storage.js';

// safeStorage calls its getter on every access, so hand it one shared instance.
const memStore = (initial) => { const m = memStorage(initial); return safeStorage(() => m); };

const ID = 'a'.repeat(22); // must satisfy REPORT_ID_RE
const loc ={ hostname: 'o.github.io', pathname: '/r/', href: 'https://o.github.io/r/#/' };

function recorder(responder = () => new Response('cipher')) {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => { calls.push(url); return responder(url, init); } };
}

test('without a token: read-only, public report fetch', async () => {
  const { calls, fetchImpl } = recorder();
  const ctx = createContext({ loc, fetchImpl, storage: memStore() });
  assert.equal(ctx.hasToken, false);
  assert.equal(ctx.github, null);
  assert.deepEqual(ctx.repo, { owner: 'o', repo: 'r' });
  assert.equal(ctx.actionsUrl, 'https://github.com/o/r/actions/workflows/analyze.yml');
  assert.equal(await ctx.fetchText(ID), 'cipher');
  assert.equal(calls[0], `https://o.github.io/r/reports/${ID}.enc`);
});

test('with a token: contents API', async () => {
  const { calls, fetchImpl } = recorder();
  const ctx = createContext({ loc, fetchImpl, storage: memStore({ 'brand-dna:token': 'tok' }) });
  assert.equal(ctx.hasToken, true);
  await ctx.fetchText(ID);
  assert.equal(calls[0], `https://api.github.com/repos/o/r/contents/reports/${ID}.enc?ref=main`);
});

test('publicJwk explains missing setup; industries loads JSON', async () => {
  const { fetchImpl } = recorder((url) =>
    url.endsWith('industries.json') ? new Response('{"saas":{"label":"SaaS"}}') : new Response('', { status: 404 }));
  const ctx = createContext({ loc, fetchImpl, storage: memStore() });
  await assert.rejects(ctx.publicJwk(), /Setup incomplete: keys\/workflow-public\.jwk/);
  assert.deepEqual(await ctx.industries(), { saas: { label: 'SaaS' } });
});

test('unknown host without override → repo null', () => {
  const ctx = createContext({ loc: { hostname: 'localhost', pathname: '/', href: 'http://localhost:8080/' }, storage: memStore() });
  assert.equal(ctx.repo, null);
  assert.equal(ctx.actionsUrl, null);
});
