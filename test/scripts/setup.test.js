import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encryptForWorkflow, decryptFromBrowser } from '../../shared/crypto.js';

const script = new URL('../../scripts/setup.mjs', import.meta.url).pathname;

test('setup writes public key and prints matching private key', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdna-'));
  const out = execFileSync('node', [script, '--out', dir], { encoding: 'utf8' });
  const publicJwk = JSON.parse(readFileSync(join(dir, 'workflow-public.jwk'), 'utf8'));
  assert.equal(publicJwk.d, undefined);
  const m = out.match(/-----BEGIN WORKFLOW_PRIVATE_KEY-----\n(.+)\n-----END WORKFLOW_PRIVATE_KEY-----/);
  assert.ok(m, 'private key block printed');
  const privateJwk = JSON.parse(m[1]);
  const text = await encryptForWorkflow({ ok: true }, publicJwk);
  assert.deepEqual(await decryptFromBrowser(text, privateJwk), { ok: true });
});

test('setup refuses to overwrite without --force', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdna-'));
  execFileSync('node', [script, '--out', dir]);
  const second = spawnSync('node', [script, '--out', dir], { encoding: 'utf8' });
  assert.equal(second.status, 1);
  assert.match(second.stderr, /--force/);
  const forced = spawnSync('node', [script, '--out', dir, '--force'], { encoding: 'utf8' });
  assert.equal(forced.status, 0);
});
