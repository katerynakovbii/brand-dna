import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIndustry } from '../../collector/industries.mjs';

test('resolveIndustry ignores inherited object properties', () => {
  for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) assert.equal(resolveIndustry(k), 'default');
  assert.equal(resolveIndustry('constructor', { constructor: { label: 'X' } }), 'constructor');
});
