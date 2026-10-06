import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleShare, MAX_CIPHERTEXT } from '../../server/share.mjs';

const sid = 's'.repeat(22);
const envelope = JSON.stringify({ v: 1, iv: 'aaaa', ct: 'bbbb' });

function blobStub() {
  const files = new Map();
  return {
    files,
    put: async (path, body, opts) => {
      assert.deepEqual(opts, { access: 'public', addRandomSuffix: false, allowOverwrite: false, contentType: 'text/plain' });
      if (files.has(path)) throw new Error('This blob already exists');
      files.set(path, body);
      return { url: `https://blob.test/${path}` };
    },
    head: async (path) => {
      if (!files.has(path)) { const e = new Error('not found'); e.name = 'BlobNotFoundError'; throw e; }
      return { url: `https://blob.test/${path}` };
    },
    fetchImpl: async (url) => new Response(files.get(url.replace('https://blob.test/', ''))),
  };
}
const post = (body) => new Request('https://x.test/api/share', { method: 'POST', body: JSON.stringify(body) });
const get = (id) => new Request(`https://x.test/api/share?id=${encodeURIComponent(id)}`);

test('stores ciphertext and serves it back', async () => {
  const deps = blobStub();
  const res = await handleShare(post({ id: sid, ciphertext: envelope }), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(deps.files.get(`shares/${sid}.enc`), envelope);
  const back = await handleShare(get(sid), deps);
  assert.equal(back.status, 200);
  assert.equal(await back.text(), envelope);
  assert.match(back.headers.get('cache-control'), /immutable/);
});

test('rejects bad ids, oversize and non-envelope ciphertext', async () => {
  const deps = blobStub();
  assert.equal((await handleShare(post({ id: '../x', ciphertext: envelope }), deps)).status, 400);
  assert.equal((await handleShare(post({ id: sid, ciphertext: 'plain text report' }), deps)).status, 400);
  assert.equal((await handleShare(post({ id: sid, ciphertext: JSON.stringify({ v: 1, iv: 'a', ct: 'b'.repeat(MAX_CIPHERTEXT) }) }), deps)).status, 413);
  assert.equal((await handleShare(new Request('https://x.test/api/share', { method: 'POST', body: '{' }), deps)).status, 400);
  assert.equal(deps.files.size, 0);
});

test('same id twice → 409', async () => {
  const deps = blobStub();
  await handleShare(post({ id: sid, ciphertext: envelope }), deps);
  assert.equal((await handleShare(post({ id: sid, ciphertext: envelope }), deps)).status, 409);
});

test('missing or invalid share → 404; storage failure → 502', async () => {
  const deps = blobStub();
  assert.equal((await handleShare(get(sid), deps)).status, 404);
  assert.equal((await handleShare(get('../etc'), deps)).status, 404);
  const broken = { ...deps, put: async () => { throw new Error('store down'); } };
  assert.equal((await handleShare(post({ id: sid, ciphertext: envelope }), broken)).status, 502);
  assert.equal((await handleShare(new Request('https://x.test/api/share', { method: 'DELETE' }), deps)).status, 405);
});
