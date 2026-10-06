import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { startAnalysis, loadReport, pollReport, recordResult, isStale } from '../../assets/js/analysis.js';
import { TokenRejectedError } from '../../assets/js/github.js';
import { createLibrary, safeStorage } from '../../assets/js/library.js';
import { generateWorkflowKeyPair, decryptFromBrowser, encryptReport, generateReportKey, newReportId } from '../../shared/crypto.js';
import { memStorage } from '../helpers/mem-storage.js';

let keys;
before(async () => { keys = await generateWorkflowKeyPair(); });
const newLib = () => {
  const s = memStorage();
  return createLibrary(safeStorage(() => s));
};

test('startAnalysis encrypts, dispatches and records a running entry', async () => {
  const library = newLib();
  const dispatched = [];
  const github = { dispatch: async (x) => { dispatched.push(x); } };
  const r = await startAnalysis({ inputs: { name: 'Acme', website: 'acme.com', industry: 'saas' }, github, library, publicJwk: keys.publicJwk, now: new Date('2026-10-06T00:00:00Z') });
  assert.equal(r.ok, true);
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].reportId, r.entry.reportId);
  assert.doesNotMatch(dispatched[0].payload, /Acme/);
  const payload = await decryptFromBrowser(dispatched[0].payload, keys.privateJwk);
  assert.equal(payload.inputs.website, 'https://acme.com/');
  assert.equal(payload.reportKey, r.entry.reportKey);
  assert.deepEqual(library.get(r.entry.reportId), { ...r.entry });
  assert.equal(r.entry.status, 'running');
  assert.equal(r.entry.createdAt, '2026-10-06T00:00:00.000Z');
});

test('startAnalysis: invalid inputs → errors, no dispatch; dispatch failure → throws, library unchanged', async () => {
  const library = newLib();
  let called = false;
  const bad = await startAnalysis({ inputs: { name: '' }, github: { dispatch: async () => { called = true; } }, library, publicJwk: keys.publicJwk });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.name);
  assert.equal(called, false);
  await assert.rejects(startAnalysis({ inputs: { name: 'A', website: 'a.com', industry: 'x' }, github: { dispatch: async () => { throw new TokenRejectedError(); } }, library, publicJwk: keys.publicJwk }), TokenRejectedError);
  assert.deepEqual(library.list(), []);
});

test('loadReport states (Review Focus #3)', async () => {
  const id = newReportId();
  const key = generateReportKey();
  const text = await encryptReport({ id, status: 'ok' }, key);
  const fetchText = async () => text;
  assert.deepEqual(await loadReport({ id, key: key.slice(0, 30), fetchText }), { state: 'invalid-key' });
  assert.deepEqual(await loadReport({ id: 'short', key, fetchText }), { state: 'invalid-key' });
  assert.deepEqual(await loadReport({ id, key: generateReportKey(), fetchText }), { state: 'invalid-key' });
  assert.deepEqual(await loadReport({ id, key, fetchText: async () => null }), { state: 'pending' });
  assert.deepEqual(await loadReport({ id: newReportId(), key, fetchText }), { state: 'invalid-key' }, 'report id must match');
  assert.deepEqual(await loadReport({ id, key, fetchText }), { state: 'ready', report: { id, status: 'ok' } });
});

test('pollReport waits until ready', async () => {
  const id = newReportId();
  const key = generateReportKey();
  const text = await encryptReport({ id, status: 'ok' }, key);
  let n = 0;
  const fetchText = async () => (++n < 3 ? null : text);
  const sleeps = [];
  const r = await pollReport({ id, key, fetchText, sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(r.state, 'ready');
  assert.deepEqual(sleeps, [15000, 15000]);
});

test('pollReport: transient errors keep polling, token errors stop, timeout, abort', async () => {
  const id = newReportId();
  const key = generateReportKey();
  let n = 0;
  const flaky = async () => { if (++n === 1) throw new TypeError('Failed to fetch'); return null; };
  let t = 0;
  const r = await pollReport({ id, key, fetchText: flaky, startedAt: 0, clock: () => t, sleep: async () => { t += 15000; } });
  assert.equal(r.state, 'timeout');
  assert.ok(n >= 40);
  const rejected = await pollReport({ id, key, fetchText: async () => { throw new TokenRejectedError(); }, sleep: async () => {} });
  assert.deepEqual(rejected, { state: 'error', message: 'GitHub token rejected — check Settings.' });
  const ac = new AbortController();
  ac.abort();
  assert.deepEqual(await pollReport({ id, key, fetchText: async () => null, signal: ac.signal }), { state: 'aborted' });
});

test('recordResult and isStale', () => {
  const library = newLib();
  const id = newReportId();
  const key = generateReportKey();
  library.upsert({ reportId: id, reportKey: key, name: 'Acme', type: 'main', parentId: null, createdAt: '2026-10-06T00:00:00.000Z', status: 'running' });
  const e = recordResult(library, { id, status: 'failed', type: 'main', parentId: null, input: null, createdAt: '2026-10-06T00:02:00.000Z' }, key);
  assert.equal(e.status, 'failed');
  assert.equal(e.name, 'Acme', 'keeps local name when report has no input');
  assert.equal(isStale({ status: 'running', createdAt: '2026-10-06T00:00:00Z' }, Date.parse('2026-10-06T00:16:00Z')), true);
  assert.equal(isStale({ status: 'running', createdAt: '2026-10-06T00:00:00Z' }, Date.parse('2026-10-06T00:05:00Z')), false);
  assert.equal(isStale({ status: 'ok', createdAt: '2020-01-01T00:00:00Z' }), false);
});

test('recordResult rejects malformed reports', () => {
  const library = newLib();
  const key = generateReportKey();
  assert.equal(recordResult(library, null, key), null);
  assert.equal(recordResult(library, 42, key), null);
  assert.equal(recordResult(library, {}, key), null);
});
