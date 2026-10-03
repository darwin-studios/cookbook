import assert from 'node:assert/strict';
import test from 'node:test';
import { choices, search, startThread } from '../lib/darwin.mjs';
import { chosenReady, isDistinctAgent, providerMessages, requireReady } from '../lib/recipe.mjs';

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

test('Recipes cannot select an unavailable capability', () => {
  assert.throws(() => chosenReady([{ agent: 'merchant', readiness: 'unavailable', canStartThread: false }], '1'), /not executable/);
});

test('An unexecutable Search match fails an Act demo instead of reporting success', () => {
  assert.throws(() => requireReady([{ agent: 'merchant', readiness: 'unavailable', canStartThread: false }], 'shopping'), /live Act demo cannot run/);
  assert.doesNotThrow(() => requireReady([{ agent: 'merchant', readiness: 'ready', canStartThread: true }], 'shopping'));
});

test('Independent checks cannot count two tools from the same agent as separate reviews', () => {
  assert.equal(isDistinctAgent([{ agent: 'auditor-a' }], { agent: 'auditor-a' }), false);
  assert.equal(isDistinctAgent([{ agent: 'auditor-a' }], { agent: 'auditor-b' }), true);
});

test('Darwin status messages are not presented as provider responses', () => {
  assert.deepEqual(providerMessages([
    { from: 'you', message: 'sent' },
    { from: 'darwin', message: 'accepted' },
    { from: 'agent', message: 'actual-response' },
  ]).map((message) => message.message), ['actual-response']);
});

test('Darwin-relayed operation results count as outcomes, not just agent-authored messages', () => {
  assert.deepEqual(providerMessages([
    { from: 'darwin', type: 'delivery_status', content: [{ type: 'text', text: 'accepted' }] },
    { from: 'darwin', type: 'result', content: [{ type: 'text', text: 'External tool answered' }], data: { answered_by: { tool: 'whoami' } } },
  ]).map((message) => message.type), ['result']);
});

test('An application-only key cannot authorize Act', async () => {
  const previousToken = process.env.DARWIN_ACCESS_TOKEN;
  const previousKey = process.env.DARWIN_API_KEY;
  delete process.env.DARWIN_ACCESS_TOKEN;
  process.env.DARWIN_API_KEY = 'test-search-key';
  try {
    await assert.rejects(startThread({ agent: 'seller', capability: 'offer', readiness: 'ready', canStartThread: true }, { messageType: 'action_request', messageContent: {} }), /user-scoped Darwin OAuth/);
  } finally {
    if (previousToken === undefined) delete process.env.DARWIN_ACCESS_TOKEN;
    else process.env.DARWIN_ACCESS_TOKEN = previousToken;
    if (previousKey === undefined) delete process.env.DARWIN_API_KEY;
    else process.env.DARWIN_API_KEY = previousKey;
  }
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

test('Act retries a transient startup 500 with the same idempotency key and body', async () => {
  const previous = process.env.DARWIN_ACCESS_TOKEN;
  process.env.DARWIN_ACCESS_TOKEN = 'test-only-token';
  try {
    const bodies = [];
    const fetchImpl = async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return bodies.length === 1
        ? { ok: false, status: 500, statusText: 'Internal Server Error', json: async () => ({}) }
        : { ok: true, json: async () => ({ thread: 'thread-1', status: 'accepted' }) };
    };
    const result = await startThread({ agent: 'agent-1', capability: 'cap-2', readiness: 'ready', canStartThread: true }, {
      messageType: 'action_request', messageContent: {}, idempotencyKey: 'attempt-1', fetchImpl,
    });
    assert.equal(result.thread, 'thread-1');
    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[0], bodies[1]);
    assert.equal(bodies[0].idempotencyKey, 'attempt-1');
  } finally {
    if (previous === undefined) delete process.env.DARWIN_ACCESS_TOKEN;
    else process.env.DARWIN_ACCESS_TOKEN = previous;
  }
});
