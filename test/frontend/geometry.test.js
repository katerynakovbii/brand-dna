import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sparklinePoints, ringDash } from '../../assets/js/components/geometry.js';

test('sparklinePoints scales to the box', () => {
  assert.equal(sparklinePoints([0, 5, 10], 100, 20, 0), '0,20 50,10 100,0');
  assert.equal(sparklinePoints([0, 0], 100, 20, 0), '0,20 100,20', 'all zero → flat baseline');
  assert.equal(sparklinePoints([4], 100, 20, 0), '0,0 100,0', 'single point → flat line');
  assert.equal(sparklinePoints([], 100, 20, 0), '');
});

test('sparklinePoints tolerates malformed input', () => {
  assert.equal(sparklinePoints(null, 100, 20), '');
  assert.equal(sparklinePoints(undefined, 100, 20), '');
  assert.equal(sparklinePoints('abc', 100, 20), '');
  assert.equal(sparklinePoints({ length: 3 }, 100, 20), '');
  assert.equal(sparklinePoints([0, NaN, 10], 100, 20, 0), '0,20 50,20 100,0', 'NaN → 0');
  assert.equal(sparklinePoints([Infinity, -Infinity, 'x'], 100, 20, 0), '0,20 50,20 100,20');
  assert.doesNotMatch(sparklinePoints([1, NaN, undefined, null], 100, 20), /NaN|Infinity/);
});

test('ringDash clamps', () => {
  const c = 2 * Math.PI * 10;
  assert.deepEqual(ringDash(50, 10), { c, dash: c / 2 });
  assert.equal(ringDash(150, 10).dash, c);
  assert.equal(ringDash(-5, 10).dash, 0);
  assert.equal(ringDash(null, 10).dash, 0);
});
