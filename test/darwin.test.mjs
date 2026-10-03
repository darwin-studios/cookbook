import assert from 'node:assert/strict';
import test from 'node:test';
import { choices, search, startThread } from '../lib/darwin.mjs';

test('Search uses the local public-v2 body and preserves ranked IDs', async () => {
  const fetchImpl = async (_url, options) => {
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { query: 'Who can audit a site?', numResults: 5 });
    return { ok: true, json: async () => ({ agents: [{ agent: 'agent-1', name: 'Auditor' }], results: [{ agent: 'agent-1', capability: 'cap-2', rank: 1, readiness: 'ready', canStartThread: true }] }) };
  };
  const found = await search('Who can audit a site?', { numResults: 5, fetchImpl });
  assert.deepEqual(choices(found).map(({ agent, agentName, capability }) => ({ agent, agentName, capability })), [{ agent: 'agent-1', agentName: 'Auditor', capability: 'cap-2' }]);
});

test('Act fails closed for a non-executable Search result', async () => {
  await assert.rejects(startThread({ agent: 'agent-1', capability: 'cap-2', readiness: 'unavailable', canStartThread: false }, { messageType: 'message', messageContent: 'Hi' }), /not currently executable/);
});

test('Search rejects invalid result counts', async () => {
  await assert.rejects(search('test', { numResults: 51 }), /1–50/);
});

test('Act sends the exact selected capability and never invents an agent ID', async () => {
  const previous = process.env.DARWIN_ACCESS_TOKEN;
  process.env.DARWIN_ACCESS_TOKEN = 'test-only-token';
  try {
    const fetchImpl = async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer test-only-token');
      const body = JSON.parse(options.body);
      assert.deepEqual(body, {
        targetAgent: 'agent-1',
        messageType: 'action_request',
        messageContent: { capability: 'cap-2', arguments: {} },
        idempotencyKey: 'attempt-1',
      });
      return { ok: true, json: async () => ({ thread: 'thread-1', status: 'accepted' }) };
    };
    const result = await startThread({ agent: 'agent-1', capability: 'cap-2', readiness: 'ready', canStartThread: true }, {
      messageType: 'action_request', messageContent: {}, idempotencyKey: 'attempt-1', fetchImpl,
    });
    assert.equal(result.thread, 'thread-1');
  } finally {
    if (previous === undefined) delete process.env.DARWIN_ACCESS_TOKEN;
    else process.env.DARWIN_ACCESS_TOKEN = previous;
  }
});
