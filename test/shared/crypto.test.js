import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toB64url, fromB64url, newReportId, generateReportKey,
  encryptReport, decryptReport, generateWorkflowKeyPair,
  encryptForWorkflow, decryptFromBrowser,
} from '../../shared/crypto.js';

test('base64url round-trips all lengths without padding', () => {
  for (let n = 0; n < 40; n++) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 250) % 256);
    const s = toB64url(bytes);
    assert.doesNotMatch(s, /[+/=]/);
    assert.deepEqual(fromB64url(s), bytes);
  }
});

test('ids and keys have fixed lengths and are random', () => {
  const id = newReportId();
  assert.match(id, /^[A-Za-z0-9_-]{22}$/);
  assert.match(generateReportKey(), /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(newReportId(), id);
});

test('report encrypt/decrypt round-trip', async () => {
  const key = generateReportKey();
  const text = await encryptReport({ hello: 'wörld', n: [1, 2] }, key);
  const parsed = JSON.parse(text);
  assert.equal(parsed.v, 1);
  assert.ok(parsed.iv && parsed.ct);
  assert.doesNotMatch(text, /wörld/);
  assert.deepEqual(await decryptReport(text, key), { hello: 'wörld', n: [1, 2] });
});

test('report decrypt rejects wrong key', async () => {
  const text = await encryptReport({ a: 1 }, generateReportKey());
  await assert.rejects(decryptReport(text, generateReportKey()), /decrypt failed/);
});

test('report decrypt rejects tampered ciphertext', async () => {
  const key = generateReportKey();
  const obj = JSON.parse(await encryptReport({ a: 1 }, key));
  const ct = fromB64url(obj.ct); ct[0] ^= 1; obj.ct = toB64url(ct);
  await assert.rejects(decryptReport(JSON.stringify(obj), key), /decrypt failed/);
});

test('report decrypt rejects garbage and malformed keys', async () => {
  await assert.rejects(decryptReport('not json', generateReportKey()), /decrypt failed/);
  const text = await encryptReport({ a: 1 }, generateReportKey());
  await assert.rejects(decryptReport(text, 'short'), /decrypt failed/);
});

test('workflow hybrid encryption round-trip', async () => {
  const { publicJwk, privateJwk } = await generateWorkflowKeyPair();
  assert.equal(publicJwk.kty, 'RSA');
  assert.equal(publicJwk.d, undefined);
  const payload = { inputs: { name: 'Acme' }, reportKey: generateReportKey() };
  const text = await encryptForWorkflow(payload, publicJwk);
  assert.doesNotMatch(text, /Acme/);
  assert.deepEqual(await decryptFromBrowser(text, privateJwk), payload);
});

test('workflow decrypt rejects other private key', async () => {
  const a = await generateWorkflowKeyPair();
  const b = await generateWorkflowKeyPair();
  const text = await encryptForWorkflow({ x: 1 }, a.publicJwk);
  await assert.rejects(decryptFromBrowser(text, b.privateJwk), /decrypt failed/);
});
