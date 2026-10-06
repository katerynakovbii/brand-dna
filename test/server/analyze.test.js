import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAnalyze } from '../../server/analyze.mjs';

const post = (body) => new Request('https://x.test/api/analyze', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const lines = async (res) => (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
const quiet = { log: () => {}, fetcher: null };

test('streams progress then the report', async () => {
  let got;
  const buildReport = async (args) => {
    got = args;
    args.onProgress({ type: 'progress', source: 'website', state: 'done' });
    return { id: args.id, status: 'ok', input: args.input };
  };
  const res = await handleAnalyze(post({ website: 'acme.com' }), { ...quiet, buildReport, newId: () => 'i'.repeat(22) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/x-ndjson');
  const ev = await lines(res);
  assert.deepEqual(ev[0], { type: 'progress', source: 'website', state: 'done' });
  assert.equal(ev.at(-1).type, 'report');
  assert.equal(ev.at(-1).report.id, 'i'.repeat(22));
  assert.equal(got.input.website, 'https://acme.com/');
  assert.equal(got.ai, null, 'no key → rules mode');
});

test('passes the AI key from env', async () => {
  let got;
  const res = await handleAnalyze(post({ website: 'acme.com' }), { ...quiet, env: { ANTHROPIC_API_KEY: 'k' }, buildReport: async (a) => { got = a; return {}; } });
  await res.text();
  assert.deepEqual(got.ai, { apiKey: 'k' });
});

test('rejects bad input with field errors', async () => {
  const res = await handleAnalyze(post({ website: 'ftp://x' }), { ...quiet, buildReport: async () => assert.fail('should not run') });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).errors.website);
});

test('rejects oversized and malformed bodies', async () => {
  const deps = { ...quiet, buildReport: async () => assert.fail('should not run') };
  assert.equal((await handleAnalyze(post(JSON.stringify({ website: 'a.com', pad: 'x'.repeat(9000) })), deps)).status, 413);
  const bad = await handleAnalyze(post('{'), deps);
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'Invalid request.' });
  assert.equal((await handleAnalyze(post('null'), deps)).status, 400);
});

test('a crashing pipeline ends with an error line and logs no brand data', async () => {
  const logs = [];
  const res = await handleAnalyze(post({ website: 'secret-brand.com' }), { fetcher: null, buildReport: async () => { throw new Error('boom secret-brand'); }, log: (m) => logs.push(m) });
  const ev = await lines(res);
  assert.deepEqual(ev.at(-1), { type: 'error', message: 'The analysis failed. Try again.' });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^analyze failed \d+ms$/);
});

test('only POST is allowed', async () => {
  const res = await handleAnalyze(new Request('https://x.test/api/analyze'), { ...quiet, buildReport: async () => ({}) });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'POST');
});
