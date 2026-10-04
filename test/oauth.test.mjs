import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchOAuthJson } from '../lib/oauth.mjs';

test('OAuth requests are bounded and parse a successful response', async () => {
  let suppliedSignal;
  const result = await fetchOAuthJson('https://example.com/oauth', {
    label: 'OAuth discovery',
    fetchImpl: async (_url, options) => {
      suppliedSignal = options.signal;
      return { ok: true, json: async () => ({ issuer: 'https://example.com' }) };
    },
  });
  assert.equal(result.issuer, 'https://example.com');
  assert.ok(suppliedSignal instanceof AbortSignal);
});

test('OAuth timeout identifies the stalled step without exposing credentials', async () => {
  await assert.rejects(
    fetchOAuthJson('https://example.com/oauth', {
      label: 'OAuth token exchange',
      timeoutMs: 1_000,
      fetchImpl: async () => { throw new DOMException('The operation timed out', 'TimeoutError'); },
    }),
    /OAuth token exchange timed out after 1 second/,
  );
});

test('OAuth timeout also covers an incomplete JSON response body', async () => {
  await assert.rejects(
    fetchOAuthJson('https://example.com/oauth', {
      label: 'OAuth discovery',
      fetchImpl: async () => ({ ok: true, json: async () => { throw new DOMException('The operation timed out', 'TimeoutError'); } }),
    }),
    /OAuth discovery timed out/,
  );
});

test('OAuth errors identify HTTP and invalid JSON responses', async () => {
  await assert.rejects(
    fetchOAuthJson('https://example.com/oauth', { label: 'OAuth client registration', fetchImpl: async () => ({ ok: false, status: 503 }) }),
    /OAuth client registration failed: HTTP 503/,
  );
  await assert.rejects(
    fetchOAuthJson('https://example.com/oauth', { label: 'OAuth discovery', fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('bad'); } }) }),
    /OAuth discovery returned invalid JSON/,
  );
});
