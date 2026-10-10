import assert from 'node:assert/strict';
import { test } from 'node:test';

import { found as searchFixture, started } from '../../../../test/fixtures.mjs';
import { runExample } from '../../test-helper.ts';

const found = searchFixture([
  {
    agentId: 'dns-agent',
    capabilityId: 'check-dns',
    name: 'Check DNS',
    description: 'Inspect SPF and DMARC',
    readiness: 'ready',
    canStartThread: true,
  },
]);

test('Search shows an agent but never communicates with an application-only caller', async () => {
  const result = await runExample('general-assistant', 'Check SPF and DMARC\n', () => ({ body: found }));
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    result.calls.map((call) => call.path),
    ['/search'],
  );
  assert.match(result.stdout, /DNS Agent — Check DNS/);
});

test('reviewed request uses exact Search IDs and waits for a provider result', async () => {
  const result = await runExample(
    'general-assistant',
    'Check SPF and DMARC\n1\na\n{"domain":"example.com"}\nyes\n',
    (call) => {
      if (call.path === '/search') return { body: found };
      if (call.path === '/act' && !call.body.threadId) return { body: started(call.body.targets[0].agentId) };
      return {
        body: {
          thread: 't1',
          cursor: 'c2',
          messages: [
            { from: 'darwin', type: 'result', content: [{ type: 'text', text: 'SPF present' }], data: { spf: true } },
          ],
          actions: [],
          requests: [],
        },
      };
    },
    'test-oauth',
  );
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.calls[1].body.targets[0].agentId, 'dns-agent');
  assert.deepEqual(result.calls[1].body.targets[0].arguments, { domain: 'example.com' });
  assert.match(result.stdout, /SPF present/);
});

test('unavailable route never starts a thread', async () => {
  const unavailable = structuredClone(found);
  unavailable.response.agents[0].canStartThread = false;
  unavailable.response.agents[0].readiness = 'unavailable';
  const result = await runExample(
    'general-assistant',
    'Check SPF and DMARC\n',
    () => ({ body: unavailable }),
    'test-oauth',
  );
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.calls.length, 1);
});

test('authentication needs another yes and resumes the same thread', async () => {
  let reads = 0;
  const result = await runExample(
    'general-assistant',
    'Check SPF and DMARC\n1\na\n{}\nyes\nyes\n\n',
    (call) => {
      if (call.path === '/search') return { body: found };
      if (call.path === '/act' && !call.body.threadId) return { body: started(call.body.targets[0].agentId) };
      if (call.path.startsWith('/act/requests/actreq_1?'))
        return {
          body:
            ++reads === 1
              ? {
                  cursor: 'c2',
                  messages: [],
                  actions: [],
                  requests: [{ type: 'authentication_request', request: 'auth-1', status: 'pending' }],
                }
              : {
                  cursor: 'c3',
                  messages: [
                    { from: 'darwin', type: 'result', data: { ok: true }, content: [{ type: 'text', text: 'Done' }] },
                  ],
                  actions: [],
                  requests: [],
                },
        };
      if (call.path === '/act' && call.body.message?.type === 'authentication_response')
        return {
          body: {
            type: 'continuation',
            threadId: 't1',
            result: { authentication: 'attempt-1', url: 'https://darwin.so/connect', status: 'awaiting_consent' },
          },
        };
      throw new Error(`Unexpected ${call.path}`);
    },
    'test-oauth',
  );
  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    result.calls.filter((call) => call.path === '/act' && call.body.message?.type === 'authentication_response').length,
    1,
  );
  assert.equal(
    result.calls.find((call) => call.path === '/act' && call.body.message?.type === 'authentication_response').body
      .message.requestId,
    'auth-1',
  );
  assert.match(result.stdout, /Done/);
});

test('a stale route error is shown without silently retrying another agent', async () => {
  const result = await runExample(
    'general-assistant',
    'Check SPF and DMARC\n1\na\n{}\nyes\n',
    (call) =>
      call.path === '/search'
        ? { body: found }
        : { status: 409, body: { code: 'ROUTE_REVISION_STALE', message: 'Search again' } },
    'test-oauth',
  );
  assert.equal(result.code, 1);
  assert.equal(result.calls.filter((call) => call.path === '/act' && !call.body.threadId).length, 1);
  assert.match(result.stderr, /ROUTE_REVISION_STALE/);
});

test('clarification stays in one Search session and preserves token without resending initial options', async () => {
  let searches = 0;
  const result = await runExample('general-assistant', 'Prepare a tax return\nCalifornia\n', (call) => {
    assert.equal(call.path, '/search');
    if (++searches === 1) {
      const first = searchFixture([]);
      first.status = 'needs_input';
      first.response.question = 'Which state?' as any;
      return { body: { ...first, searchToken: 'test-owner-token' } };
    }
    assert.equal(call.body.previousResponseId, found.responseId);
    assert.equal(call.headers['x-search-token'], 'test-owner-token');
    assert.equal(call.body.maxResults, undefined);
    assert.equal(call.body.query, 'California');
    return { body: found };
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(searches, 2);
  assert.match(result.stdout, /Which state/);
  assert.match(result.stdout, /Connection prompt/);
});

test('HTTP 200 with failed target is not reported as a started thread', async () => {
  const result = await runExample(
    'general-assistant',
    'Check DNS\n1\na\n{}\nyes\n',
    (call) => {
      if (call.path === '/search') return { body: found };
      return {
        body: { ...started(), status: 'failed', threads: [{ agentId: 'dns-agent', errorCode: 'ROUTE_NOT_READY' }] },
      };
    },
    'test-oauth',
  );
  assert.equal(result.code, 1);
  assert.match(result.stderr, /ROUTE_NOT_READY/);
  assert.equal(result.calls.length, 2);
  assert.doesNotMatch(result.stdout, /Accepted on thread/);
});
