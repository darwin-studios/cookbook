import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runExample } from '../../test-helper.ts';

const found = { outcome: 'MATCH', agents: [{ agent: 'dns-agent', name: 'DNS Agent' }], results: [{
  agent: 'dns-agent', capability: 'check-dns', name: 'Check DNS', description: 'Inspect SPF and DMARC',
  readiness: 'ready', canStartThread: true,
}] };

test('Search shows an agent but never communicates with an application-only caller', async () => {
  const result = await runExample('general-assistant', 'Check SPF and DMARC\n', () => ({ body: found }));
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.calls.map((call) => call.path), ['/search']);
  assert.match(result.stdout, /DNS Agent — Check DNS/);
});

test('reviewed request uses exact Search IDs and waits for a provider result', async () => {
  const result = await runExample('general-assistant', 'Check SPF and DMARC\n1\na\n{"domain":"example.com"}\nyes\n', (call) => {
    if (call.path === '/search') return { body: found };
    if (call.path === '/act/threads') return { body: { thread: 't1', cursor: 'c1', status: 'accepted' } };
    return { body: { thread: 't1', cursor: 'c2', messages: [{ from: 'darwin', type: 'result', content: [{ type: 'text', text: 'SPF present' }], data: { spf: true } }], actions: [], requests: [] } };
  }, 'test-oauth');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.calls[1].body.targetAgent, 'dns-agent');
  assert.deepEqual(result.calls[1].body.messageContent, { capability: 'check-dns', arguments: { domain: 'example.com' } });
  assert.match(result.stdout, /SPF present/);
});

test('unavailable route never starts a thread', async () => {
  const unavailable = structuredClone(found);
  unavailable.results[0].canStartThread = false;
  unavailable.results[0].readiness = 'unavailable';
  const result = await runExample('general-assistant', 'Check SPF and DMARC\n', () => ({ body: unavailable }), 'test-oauth');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.calls.length, 1);
});

test('authentication needs another yes and resumes the same thread', async () => {
  let reads = 0;
  const result = await runExample('general-assistant', 'Check SPF and DMARC\n1\na\n{}\nyes\nyes\n\n', (call) => {
    if (call.path === '/search') return { body: found };
    if (call.path === '/act/threads') return { body: { thread: 't1', cursor: 'c1' } };
    if (call.path.startsWith('/act/threads/t1')) return { body: ++reads === 1
      ? { cursor: 'c2', messages: [], actions: [], requests: [{ type: 'authentication_request', request: 'auth-1', status: 'pending' }] }
      : { cursor: 'c3', messages: [{ from: 'darwin', type: 'result', data: { ok: true }, content: [{ type: 'text', text: 'Done' }] }], actions: [], requests: [] } };
    if (call.path === '/act/authentications') return { body: { authentication: 'attempt-1', url: 'https://darwin.so/connect', status: 'awaiting_consent' } };
    throw new Error(`Unexpected ${call.path}`);
  }, 'test-oauth');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.calls.filter((call) => call.path === '/act/authentications').length, 1);
  assert.equal(result.calls.find((call) => call.path === '/act/authentications').body.request, 'auth-1');
  assert.match(result.stdout, /Done/);
});

test('a stale route error is shown without silently retrying another agent', async () => {
  const result = await runExample('general-assistant', 'Check SPF and DMARC\n1\na\n{}\nyes\n', (call) =>
    call.path === '/search' ? { body: found } : { status: 409, body: { code: 'ROUTE_REVISION_STALE', message: 'Search again' } }, 'test-oauth');
  assert.equal(result.code, 1);
  assert.equal(result.calls.filter((call) => call.path === '/act/threads').length, 1);
  assert.match(result.stderr, /ROUTE_REVISION_STALE/);
});
