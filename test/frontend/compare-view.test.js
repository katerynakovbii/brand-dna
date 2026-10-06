import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../helpers/fake-dom.js';

const restore = installFakeDom();
const { render } = await import('../../assets/js/views/compare.js');
const { compareRows } = await import('../../assets/js/format.js');
test.after(restore);

test('compare view module exports render function', () => {
  assert.equal(typeof render, 'function', 'render should be a function');
});

test('compareRows with malformed reports does not throw', () => {
  // compareRows is used internally by compare view's table function
  // Test that it handles malformed data gracefully
  const malformedA = {
    id: 'A'.repeat(22),
    status: 'ok',
    input: { name: 5, website: 'javascript:x' },
    positioning: { tags: 'not-an-array', statement: 7 },
    touchpoints: { score: 'not-a-number' },
    mentions: { d7: { total: 'x' }, d30: { total: 5 }, d60: { total: 100 } },
  };
  const malformedB = {
    id: 'B'.repeat(22),
    status: 'failed',
    positioning: null,
    touchpoints: null,
    mentions: null,
  };

  // Should not throw even with malformed data
  const rows = compareRows(malformedA, malformedB);
  assert.ok(Array.isArray(rows), 'compareRows should return an array');
  assert.ok(rows.length > 0, 'compareRows should return comparison rows');
  assert.ok(rows.every((r) => typeof r.label === 'string'), 'all rows should have string labels');
});
