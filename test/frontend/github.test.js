import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repoFromLocation, createGithub, fetchPublicReport, TokenRejectedError } from '../../assets/js/github.js';

test('repoFromLocation', () => {
  assert.deepEqual(repoFromLocation({ hostname: 'kate.github.io', pathname: '/brand-dna/' }), { owner: 'kate', repo: 'brand-dna' });
  assert.deepEqual(repoFromLocation({ hostname: 'kate.github.io', pathname: '/' }), { owner: 'kate', repo: 'kate.github.io' });
  assert.equal(repoFromLocation({ hostname: 'localhost', pathname: '/' }), null);
  assert.deepEqual(repoFromLocation({ hostname: 'localhost', pathname: '/' }, { owner: 'o', repo: 'r' }), { owner: 'o', repo: 'r' });
});

function recorder(responder) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => { calls.push({ url, init }); return responder(url, init); };
  return { calls, fetchImpl };
}

test('dispatch posts workflow inputs with bearer token', async () => {
  const { calls, fetchImpl } = recorder(() => new Response(null, { status: 204 }));
  const gh = createGithub({ owner: 'o', repo: 'r', token: 'tok', fetchImpl });
  await gh.dispatch({ reportId: 'id', payload: 'ct' });
  assert.equal(calls[0].url, 'https://api.github.com/repos/o/r/actions/workflows/analyze.yml/dispatches');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(calls[0].init.body), { ref: 'main', inputs: { reportId: 'id', payload: 'ct' } });
  assert.equal(gh.actionsUrl, 'https://github.com/o/r/actions/workflows/analyze.yml');
});

test('401/403/404 on dispatch → TokenRejectedError; 500 → generic', async () => {
  for (const status of [401, 403, 404]) {
    const gh = createGithub({ owner: 'o', repo: 'r', token: 't', fetchImpl: async () => new Response('', { status }) });
    await assert.rejects(gh.dispatch({ reportId: 'a', payload: 'b' }), TokenRejectedError);
  }
  const gh = createGithub({ owner: 'o', repo: 'r', token: 't', fetchImpl: async () => new Response('', { status: 500 }) });
  await assert.rejects(gh.dispatch({ reportId: 'a', payload: 'b' }), /GitHub API error 500/);
});

test('fetchReport uses raw contents API; 404 → null', async () => {
  const { calls, fetchImpl } = recorder((url) => (url.includes('/yes.enc') ? new Response('cipher') : new Response('', { status: 404 })));
  const gh = createGithub({ owner: 'o', repo: 'r', token: 't', fetchImpl });
  assert.equal(await gh.fetchReport('yes'), 'cipher');
  assert.equal(await gh.fetchReport('no'), null);
  assert.equal(calls[0].url, 'https://api.github.com/repos/o/r/contents/reports/yes.enc?ref=main');
  assert.equal(calls[0].init.headers.accept, 'application/vnd.github.raw');
});

test('testToken explains failures', async () => {
  const ok = createGithub({ owner: 'o', repo: 'r', token: 't', fetchImpl: async () => new Response('{}') });
  assert.deepEqual(await ok.testToken(), { ok: true, message: 'Token works for o/r.' });
  const noActions = createGithub({ owner: 'o', repo: 'r', token: 't', fetchImpl: async (url) => new Response('{}', { status: url.endsWith('/r') ? 200 : 404 }) });
  assert.match((await noActions.testToken()).message, /Actions/);
  const bad = createGithub({ owner: 'o', repo: 'r', token: 't', fetchImpl: async () => new Response('', { status: 401 }) });
  assert.deepEqual(await bad.testToken(), { ok: false, message: 'GitHub token rejected — check Settings.' });
});

test('fetchPublicReport tries Pages then raw.githubusercontent', async () => {
  const { calls, fetchImpl } = recorder((url) => (url.startsWith('https://raw.') ? new Response('cipher') : new Response('', { status: 404 })));
  const text = await fetchPublicReport({ id: 'abc', owner: 'o', repo: 'r', pageBase: 'https://o.github.io/r/', fetchImpl });
  assert.equal(text, 'cipher');
  assert.deepEqual(calls.map((c) => c.url), ['https://o.github.io/r/reports/abc.enc', 'https://raw.githubusercontent.com/o/r/main/reports/abc.enc']);
  const none = await fetchPublicReport({ id: 'abc', pageBase: 'http://localhost:8080/', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal(none, null);
});
