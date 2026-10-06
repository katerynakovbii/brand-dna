import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRerender } from '../../assets/js/views/dashboard.js';

test('shouldRerender only for terminal states that change the library', () => {
  assert.equal(shouldRerender('ready'), true);
  assert.equal(shouldRerender('timeout'), true);
  for (const s of ['error', 'invalid-key', 'aborted', 'pending']) assert.equal(shouldRerender(s), false);
});
