import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWebsite, validateInputs, failedReport, REPORT_ID_RE, REPORT_KEY_RE } from '../../shared/schema.js';

test('normalizeWebsite adds scheme and trims (Review Focus #2)', () => {
  assert.equal(normalizeWebsite('  acme.com '), 'https://acme.com/');
  assert.equal(normalizeWebsite('HTTP://Acme.com/About'), 'http://acme.com/About');
  assert.equal(normalizeWebsite('www.acme.co.uk/shop'), 'https://www.acme.co.uk/shop');
});

test('normalizeWebsite rejects unsafe or junk input', () => {
  for (const bad of ['', '   ', 'javascript:alert(1)', 'ftp://acme.com', 'localhost', 'http://127.0.0.1', '10.0.0.1',
    'https://user:pw@acme.com', 'not a url', 'http://[::1]/']) {
    assert.equal(normalizeWebsite(bad), null, bad);
  }
});

test('validateInputs accepts a full main request', () => {
  const r = validateInputs({
    name: '  Acme ', website: 'acme.com', industry: 'SaaS / Software',
    socials: { instagram: 'instagram.com/acmehq', linkedin: '', other: ['https://acme.substack.com', ''] },
  });
  assert.deepEqual(r, {
    ok: true,
    value: {
      name: 'Acme', website: 'https://acme.com/', industry: 'SaaS / Software',
      socials: { instagram: 'https://instagram.com/acmehq', other: ['https://acme.substack.com/'] },
      type: 'main', parentId: null,
    },
  });
});

test('validateInputs reports field errors', () => {
  const r = validateInputs({ name: '', website: 'javascript:alert(1)', industry: '', socials: { x: 'nope nope' } });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['industry', 'name', 'website', 'x']);
  assert.equal(validateInputs({ name: 'A', industry: 'x' }).errors.website, 'Enter the website.');
  assert.match(validateInputs({ name: 'x'.repeat(101), website: 'a.com', industry: 'x' }).errors.name, /too long/);
});

test('competitor runs need a parent but not a website', () => {
  const parentId = 'A'.repeat(22);
  const ok = validateInputs({ name: 'Trello', website: '', industry: 'saas', type: 'competitor', parentId });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.website, null);
  assert.equal(ok.value.parentId, parentId);
  const bad = validateInputs({ name: 'Trello', industry: 'saas', type: 'competitor' });
  assert.ok(bad.errors.parentId);
});

test('id/key regexes and failedReport', () => {
  assert.ok(REPORT_ID_RE.test('a'.repeat(22)));
  assert.ok(!REPORT_ID_RE.test('a'.repeat(21)));
  assert.ok(REPORT_KEY_RE.test('_'.repeat(43)));
  const r = failedReport({ id: 'x'.repeat(22), error: 'boom', now: new Date('2026-10-06T00:00:00Z') });
  assert.equal(r.status, 'failed');
  assert.equal(r.error, 'boom');
  assert.equal(r.createdAt, '2026-10-06T00:00:00.000Z');
  assert.equal(r.type, 'main');
  assert.deepEqual(r.competitors, []);
});
