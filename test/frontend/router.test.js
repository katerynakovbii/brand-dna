import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, reportHash, compareHash } from '../../assets/js/router.js';

const id = 'A'.repeat(22);
const id2 = 'B'.repeat(22);
const key = 'k'.repeat(43);

test('parses routes', () => {
  assert.deepEqual(parseRoute(''), { name: 'home' });
  assert.deepEqual(parseRoute('#/'), { name: 'home' });
  assert.deepEqual(parseRoute('#/reports'), { name: 'reports' });
  assert.deepEqual(parseRoute(`#/report/${id}`), { name: 'report', id });
  assert.deepEqual(parseRoute(`#/compare/${id}/${id2}`), { name: 'compare', a: id, b: id2 });
  assert.deepEqual(parseRoute(`#/s/${id}?k=${key}`), { name: 'shared', id, key });
  assert.deepEqual(parseRoute(`#/s/${id}`), { name: 'shared', id, key: '' });
  assert.deepEqual(parseRoute('#/settings'), { name: 'notfound' });
  assert.deepEqual(parseRoute('#/what/ever'), { name: 'notfound' });
});

test('builds hashes that round-trip', () => {
  assert.deepEqual(parseRoute(reportHash(id)), { name: 'report', id });
  assert.deepEqual(parseRoute(compareHash(id, id2)), { name: 'compare', a: id, b: id2 });
});

test('parseRoute handles non-string inputs without throwing', () => {
  assert.deepEqual(parseRoute(null), { name: 'notfound' });
  assert.deepEqual(parseRoute(42), { name: 'notfound' });
  assert.deepEqual(parseRoute(undefined), { name: 'home' });
});
