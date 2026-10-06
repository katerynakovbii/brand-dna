import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, reportHash, compareHash, absoluteLink } from '../../assets/js/router.js';

const id = 'A'.repeat(22);
const key = 'k'.repeat(43);

test('parses routes', () => {
  assert.deepEqual(parseRoute(''), { name: 'dashboard' });
  assert.deepEqual(parseRoute('#/'), { name: 'dashboard' });
  assert.deepEqual(parseRoute('#/settings'), { name: 'settings' });
  assert.deepEqual(parseRoute('#/new'), { name: 'new' });
  assert.deepEqual(parseRoute(`#/report/${id}?k=${key}`), { name: 'report', id, key });
  assert.deepEqual(parseRoute(`#/report/${id}`), { name: 'report', id, key: '' });
  assert.deepEqual(parseRoute('#/compare/a?k=1&b=c&kb=2'), { name: 'compare', a: 'a', ka: '1', b: 'c', kb: '2' });
  assert.deepEqual(parseRoute('#/what/ever'), { name: 'notfound' });
});

test('builds hashes that round-trip', () => {
  assert.deepEqual(parseRoute(reportHash(id, key)), { name: 'report', id, key });
  assert.deepEqual(parseRoute(compareHash(id, key, 'B'.repeat(22), 'z'.repeat(43))),
    { name: 'compare', a: id, ka: key, b: 'B'.repeat(22), kb: 'z'.repeat(43) });
  assert.equal(absoluteLink('#/x', { origin: 'https://me.github.io', pathname: '/brand-dna/' }), 'https://me.github.io/brand-dna/#/x');
});

test('parseRoute handles non-string inputs without throwing', () => {
  assert.deepEqual(parseRoute(null), { name: 'notfound' });
  assert.deepEqual(parseRoute(42), { name: 'notfound' });
  assert.deepEqual(parseRoute(undefined), { name: 'dashboard' });
  assert.doesNotThrow(() => parseRoute(null));
  assert.doesNotThrow(() => parseRoute(42));
  assert.doesNotThrow(() => parseRoute(undefined));
});
