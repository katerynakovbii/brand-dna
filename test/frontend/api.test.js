import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAnalysis } from '../../assets/js/api.js';

const streamOf = (...chunks) => new Response(new ReadableStream({
  start(c) { for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch)); c.close(); },
}), { headers: { 'content-type': 'application/x-ndjson' } });

test('posts inputs and parses events split across chunks', async () => {
  const seen = [];
  let req;
  const r = await runAnalysis({
    inputs: { website: 'acme.com' },
    onEvent: (e) => seen.push(e),
    fetchImpl: async (url, init) => { req = { url, init }; return streamOf('{"type":"progress","sou', 'rce":"website","state":"done"}\n{"type":"report","report":{"id":"x"}}\n'); },
  });
  assert.equal(req.url, '/api/analyze');
  assert.equal(req.init.method, 'POST');
  assert.deepEqual(JSON.parse(req.init.body), { website: 'acme.com' });
  assert.deepEqual(seen[0], { type: 'progress', source: 'website', state: 'done' });
  assert.deepEqual(r, { ok: true, report: { id: 'x' } });
});

test('a final line without newline still counts', async () => {
  const r = await runAnalysis({ inputs: {}, fetchImpl: async () => streamOf('{"type":"report","report":{"id":"y"}}') });
  assert.deepEqual(r, { ok: true, report: { id: 'y' } });
});

test('a stream cut before the report is a timeout', async () => {
  const r = await runAnalysis({ inputs: {}, fetchImpl: async () => streamOf('{"type":"progress","source":"website","state":"done"}\n{"type":"pro') });
  assert.deepEqual(r, { ok: false, message: 'The analysis took too long. Try again.' });
});

test('a stream that errors mid-way is a timeout', async () => {
  const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"type":"progress"}\n')); c.error(new TypeError('network')); } });
  const r = await runAnalysis({ inputs: {}, fetchImpl: async () => new Response(body) });
  assert.deepEqual(r, { ok: false, message: 'The analysis took too long. Try again.' });
});

test('maps 400, 429, 5xx, error lines and network failures', async () => {
  assert.deepEqual(await runAnalysis({ inputs: {}, fetchImpl: async () => Response.json({ errors: { website: 'bad' } }, { status: 400 }) }), { ok: false, errors: { website: 'bad' } });
  assert.deepEqual(await runAnalysis({ inputs: {}, fetchImpl: async () => new Response('', { status: 429 }) }), { ok: false, message: 'Too many analyses from this network — try again in an hour.' });
  assert.deepEqual(await runAnalysis({ inputs: {}, fetchImpl: async () => new Response('', { status: 500 }) }), { ok: false, message: 'The analysis failed. Try again.' });
  assert.deepEqual(await runAnalysis({ inputs: {}, fetchImpl: async () => streamOf('{"type":"error","message":"m"}\n') }), { ok: false, message: 'm' });
  assert.deepEqual(await runAnalysis({ inputs: {}, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), { ok: false, message: "Couldn't reach the server. Check your connection and try again." });
});

test('abort is reported as aborted', async () => {
  const ac = new AbortController();
  ac.abort();
  const r = await runAnalysis({ inputs: {}, signal: ac.signal, fetchImpl: async (_u, init) => { init.signal.throwIfAborted(); } });
  assert.deepEqual(r, { ok: false, aborted: true });
});
