import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formToInputs } from '../../assets/js/views/new.js';

const fd = (o) => ({ get: (k) => (k in o ? o[k] : null) });

test('formToInputs collects raw values', () => {
  assert.deepEqual(formToInputs(fd({
    name: ' Acme ', website: 'acme.com', industry: 'SaaS / Software', industryCustom: 'ignored',
    instagram: 'https://instagram.com/acme', linkedin: '', other: 'https://a.test\n\n  https://b.test  \n',
  })), {
    name: ' Acme ', website: 'acme.com', industry: 'SaaS / Software',
    socials: { instagram: 'https://instagram.com/acme', linkedin: '', x: '', facebook: '', tiktok: '', youtube: '', other: ['https://a.test', 'https://b.test'] },
  });
});

test('custom industry wins when selected', () => {
  assert.equal(formToInputs(fd({ industry: '__custom', industryCustom: 'Pet care' })).industry, 'Pet care');
  assert.deepEqual(formToInputs(fd({})).socials.other, []);
});
