import test from 'node:test';
import assert from 'node:assert/strict';
import { searchLatencyBudgetMs, searchLatencyPasses } from '../lib/preflight.mjs';

test('Search preflight allows one bounded request or one exact-plus-fallback discovery', () => {
  assert.equal(searchLatencyBudgetMs(), 5_000);
  assert.equal(searchLatencyBudgetMs({ broadened: true }), 10_000);
  assert.equal(searchLatencyPasses(5_000), true);
  assert.equal(searchLatencyPasses(5_001), false);
  assert.equal(searchLatencyPasses(10_000, { broadened: true }), true);
  assert.equal(searchLatencyPasses(10_001, { broadened: true }), false);
  assert.equal(searchLatencyPasses(Number.NaN), false);
});
