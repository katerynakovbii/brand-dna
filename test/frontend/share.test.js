import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShareLink, loadShared, parseShareLink } from '../../assets/js/share.js';
import { handleShare } from '../../server/share.mjs';

const report = { v: 1, id: 'r'.repeat(22), input: { name: 'Acme' } };

function server() {
  const files = new Map();
  const deps = {
    put: async (p, body) => { files.set(p, body); },
    head: async (p) => { if (!files.has(p)) throw new Error('nf'); return { url: p }; },
    fetchImpl: async (p) => new Response(files.get(p)),
  };
  const calls = [];
  const fetchImpl = async (url, init = {}) => { calls.push(url); return handleShare(new Request(new URL(url, 'https://app.test'), init), deps); };
  return { files, calls, fetchImpl };
}

test('share link round-trips through the server without exposing the key', async () => {
  const s = server();
  const link = await createShareLink(report, { fetchImpl: s.fetchImpl, origin: 'https://app.test' });
  const { id, key } = parseShareLink(link);
  assert.match(link, /^https:\/\/app\.test\/#\/s\/[A-Za-z0-9_-]{22}\?k=[A-Za-z0-9_-]{43}$/);
  assert.notEqual(id, report.id, 'share id is separate from the report id');
  assert.ok(![...s.files.values()][0].includes(key));
  assert.ok(![...s.files.values()][0].includes('Acme'));
  assert.deepEqual(await loadShared(id, key, { fetchImpl: s.fetchImpl }), { ok: true, report });
});

test('wrong key, missing blob or malformed link → expired message', async () => {
  const s = server();
  const { id } = parseShareLink(await createShareLink(report, { fetchImpl: s.fetchImpl, origin: 'https://app.test' }));
  const expired = { ok: false, message: 'This link is incomplete or has expired.' };
  assert.deepEqual(await loadShared(id, 'k'.repeat(43), { fetchImpl: s.fetchImpl }), expired);
  assert.deepEqual(await loadShared('m'.repeat(22), 'k'.repeat(43), { fetchImpl: s.fetchImpl }), expired);
  const before = s.calls.length;
  assert.deepEqual(await loadShared('../x', 'k'.repeat(43), { fetchImpl: s.fetchImpl }), expired);
  assert.deepEqual(await loadShared(id, '', { fetchImpl: s.fetchImpl }), expired);
  assert.equal(s.calls.length, before, 'no fetch for malformed links');
  assert.deepEqual(await loadShared(id, 'k'.repeat(43), { fetchImpl: async () => { throw new TypeError('offline'); } }), expired);
});

test('a failed upload throws', async () => {
  await assert.rejects(createShareLink(report, { fetchImpl: async () => new Response('', { status: 502 }), origin: 'https://app.test' }), /share failed/);
});
