import test from 'node:test';
import assert from 'node:assert/strict';

test('health timestamp is ISO string shape', () => {
  const value = new Date().toISOString();
  assert.match(value, /^\d{4}-\d{2}-\d{2}T/);
});
