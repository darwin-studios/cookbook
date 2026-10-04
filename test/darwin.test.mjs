import assert from 'node:assert/strict';
import test from 'node:test';
import { choices, search, startThread, getThread, request, DarwinError } from '../lib/darwin.mjs';
import { chosenReady, isDistinctAgent, providerMessages, readThread, requireReady, showOutcome } from '../lib/recipe.mjs';

test('Search uses the local public-v2 body and preserves ranked IDs', async () => {
  const fetchImpl = async (_url, options) => {
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { query: 'Who can audit a site?', numResults: 5 });
    return { ok: true, json: async () => ({ agents: [{ agent: 'agent-1', name: 'Auditor' }], results: [{ agent: 'agent-1', capability: 'cap-2', rank: 1, readiness: 'ready', canStartThread: true }] }) };
  };
  const found = await search('Who can audit a site?', { numResults: 5, fetchImpl });
  assert.deepEqual(choices(found).map(({ agent, agentName, capability }) => ({ agent, agentName, capability })), [{ agent: 'agent-1', agentName: 'Auditor', capability: 'cap-2' }]);
});

test('Search can focus a product request on shopping agents', async () => {
  const fetchImpl = async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), {
      query: 'running shoes', category: 'shopping', objective: 'Prefer quote-capable shopping agents', numResults: 10,
    });
    return { ok: true, json: async () => ({ agents: [], results: [] }) };
  };
  await search('running shoes', { category: 'shopping', objective: 'Prefer quote-capable shopping agents', numResults: 10, fetchImpl });
});

test('Act fails closed for a non-executable Search result', async () => {
  await assert.rejects(startThread({ agent: 'agent-1', capability: 'cap-2', readiness: 'unavailable', canStartThread: false }, { messageType: 'message', messageContent: 'Hi' }), /not currently executable/);
});

test('Search rejects invalid result counts', async () => {
  await assert.rejects(search('test', { numResults: 51 }), /1–50/);
});

test('Act preserves a structured route error code for callers', async () => {
  await assert.rejects(
    request('/act/threads', {
      method: 'POST', body: {},
      fetchImpl: async () => ({
        ok: false, status: 422, statusText: 'Unprocessable Entity',
        json: async () => ({ code: 'ROUTE_VERIFICATION_EXPIRED', message: 'This route is no longer verified.' }),
      }),
    }),
    (error) => error instanceof DarwinError && error.status === 422 &&
      error.code === 'ROUTE_VERIFICATION_EXPIRED' && /ROUTE_VERIFICATION_EXPIRED/.test(error.message),
  );
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

test('Thread reads preserve real provider events and pending requests', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(url, /\/act\/threads\/thread-1\?cursor=thread-1%3A1&wait=true$/);
    return { ok: true, json: async () => ({
      cursor: 'thread-1:3', hasMore: false, needsAttention: true,
      messages: [{ from: 'agent', type: 'result', content: [{ type: 'text', text: 'Live answer' }], data: { source: 'provider' } }],
      requests: [{ type: 'approval_request', request: 'approval', status: 'pending' }],
    }) };
  };
  try {
    const state = await getThread('thread-1', { cursor: 'thread-1:1', wait: true });
    assert.equal(state.messages[0].from, 'agent');
    assert.equal(state.messages[0].content[0].text, 'Live answer');
    assert.deepEqual(state.requests, [{ type: 'approval_request', request: 'approval', status: 'pending' }]);
  } finally { globalThis.fetch = originalFetch; }
});

test('Act sends the exact selected capability and never invents an agent ID', async () => {
  const previous = process.env.DARWIN_ACCESS_TOKEN;
  process.env.DARWIN_ACCESS_TOKEN = 'test-only-token';
  try {
    const calls = [];
    const fetchImpl = async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer test-only-token');
      calls.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ thread: 'thread-1', cursor: 'thread-1:1', status: 'accepted' }) };
    };
    const result = await startThread({ agent: 'agent-1', capability: 'cap-2', readiness: 'ready', canStartThread: true }, {
      messageType: 'action_request', messageContent: {}, idempotencyKey: 'attempt-1', fetchImpl,
    });
    assert.equal(result.thread, 'thread-1');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, {
      targetAgent: 'agent-1', messageType: 'action_request',
      messageContent: { capability: 'cap-2', arguments: {} }, idempotencyKey: 'attempt-1',
    });
  } finally {
    if (previous === undefined) delete process.env.DARWIN_ACCESS_TOKEN;
    else process.env.DARWIN_ACCESS_TOKEN = previous;
  }
});

test('Act does not replay an uncertain thread-start failure', async () => {
  const previous = process.env.DARWIN_ACCESS_TOKEN;
  process.env.DARWIN_ACCESS_TOKEN = 'test-only-token';
  try {
    const bodies = [];
    const fetchImpl = async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return { ok: false, status: 503, statusText: 'Service Unavailable',
        json: async () => ({ code: 'THREAD_DELIVERY_RECONCILIATION_REQUIRED' }) };
    };
    await assert.rejects(startThread({ agent: 'agent-1', capability: 'cap-2', readiness: 'ready', canStartThread: true }, {
      messageType: 'action_request', messageContent: {}, idempotencyKey: 'attempt-1', fetchImpl,
    }), (error) => error instanceof DarwinError && error.code === 'THREAD_DELIVERY_RECONCILIATION_REQUIRED');
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].idempotencyKey, 'attempt-1');
  } finally {
    if (previous === undefined) delete process.env.DARWIN_ACCESS_TOKEN;
    else process.env.DARWIN_ACCESS_TOKEN = previous;
  }
});

test('A thread error is displayed as failure, not a provider answer', () => {
  const lines = [];
  const originalLog = console.log;
  console.log = (...values) => lines.push(values.join(' '));
  try {
    showOutcome('Specialist', { thread: 'thread-1', messages: [],
      errors: [{ code: 'MCP_TOOL_ERROR', retryable: false }] });
  } finally { console.log = originalLog; }
  assert.match(lines.join('\n'), /Provider\/runtime error MCP_TOOL_ERROR/);
  assert.match(lines.join('\n'), /No successful external response/);
});

test('Thread reads stop on a structured provider error', async () => {
  const originalFetch = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async () => {
    reads++;
    return { ok: true, json: async () => ({
      cursor: 'thread-1:2', hasMore: false, needsAttention: false, messages: [], requests: [],
      errors: [{ event: 'error-1', code: 'MCP_TOOL_ERROR', retryable: false }],
    }) };
  };
  try {
    const outcome = await readThread({ thread: 'thread-1', cursor: 'thread-1:1' });
    assert.deepEqual(outcome.errors.map((error) => error.code), ['MCP_TOOL_ERROR']);
    assert.equal(reads, 1);
  } finally { globalThis.fetch = originalFetch; }
});
