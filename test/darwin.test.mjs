import assert from 'node:assert/strict';
import test from 'node:test';
import { choices, search, startThread, sendThreadMessage, getThread, request, DarwinError } from '../lib/darwin.mjs';
import { chosenReady, hasProviderResult, isDistinctAgent, isShoppingResearchCandidate, providerMessages, readThread, requireReady, showOutcome } from '../lib/recipe.mjs';

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
      query: 'running shoes', category: 'shopping', objective: 'Find product-search or price-comparison capabilities, not purchase or checkout', numResults: 10,
    });
    return { ok: true, json: async () => ({ agents: [], results: [] }) };
  };
  await search('running shoes', { category: 'shopping', objective: 'Find product-search or price-comparison capabilities, not purchase or checkout', numResults: 10, fetchImpl });
});

test('Shopping recipe only offers product research candidates', () => {
  assert.equal(isShoppingResearchCandidate({ name: 'product-search', description: 'Google Shopping results with prices' }), true);
  assert.equal(isShoppingResearchCandidate({ name: 'Merchant check', description: 'Is this online store safe to buy from?' }), false);
  assert.equal(isShoppingResearchCandidate({ name: 'Shopping guide', description: 'When-to-use shopping workflow' }), false);
  assert.equal(isShoppingResearchCandidate({ name: 'Checkout', description: 'Purchase a product from shopping results' }), false);
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

test('Public MCP tool-selection conflict preserves exact choices and does not retry', async () => {
  const details = {
    code: 'THREAD_TOOL_SELECTION_REQUIRED', targetAgent: 'mcp-agent', agent: 'personal-agent',
    expiresAt: '2026-10-04T00:00:00.000Z',
    capabilities: [{ capability: 'public-mcp:abc', title: 'whoami', inputSchema: { type: 'object' },
      effect: 'external_effect', pricing: 'unknown', requiresConfirmation: true }],
  };
  let calls = 0;
  await assert.rejects(request('/act/threads', {
    method: 'POST', body: { targetAgent: 'mcp-agent' }, fetchImpl: async () => {
      calls++;
      return { ok: false, status: 409, statusText: 'Conflict', json: async () => details };
    },
  }), (error) => error instanceof DarwinError && error.code === details.code &&
    error.details.capabilities[0].title === 'whoami' && /whoami/.test(error.message));
  assert.equal(calls, 1);
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
    { from: 'you', type: 'message', content: [{ type: 'text', text: 'sent' }] },
    { from: 'darwin', type: 'message', content: [{ type: 'text', text: 'working' }] },
    { from: 'agent', type: 'message', content: [{ type: 'text', text: 'actual-response' }] },
  ]).map((message) => message.content[0].text), ['actual-response']);
});

test('Darwin-relayed operation results count as outcomes, not just agent-authored messages', () => {
  assert.deepEqual(providerMessages([
    { from: 'darwin', type: 'result', content: [{ type: 'text', text: 'External tool answered' }], data: { answered_by: { tool: 'whoami' } } },
  ]).map((message) => message.type), ['result']);
});

test('An interim agent message is not a completed action result', () => {
  assert.equal(hasProviderResult([{ from: 'agent', type: 'message', content: [{ type: 'text', text: 'Working on it' }] }]), false);
  assert.equal(hasProviderResult([{ from: 'darwin', type: 'result', content: [{ type: 'text', text: 'Done' }] }]), true);
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

test('Thread reads use the public cursor and preserve real provider messages', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(url, /\/act\/threads\/thread-1\?cursor=thread-1%3A1&wait=true$/);
    return { ok: true, json: async () => ({
      thread: 'thread-1', cursor: 'thread-1:3', hasMore: false, needsAttention: true,
      messages: [{ from: 'agent', type: 'result', content: [{ type: 'text', text: 'Live answer' }], data: { source: 'provider' } }],
      actions: [{ action: 'op-1', status: 'succeeded' }],
      requests: [{ request: 'approval', type: 'approval_request', status: 'pending' }],
    }) };
  };
  try {
    const state = await getThread('thread-1', { cursor: 'thread-1:1', wait: true });
    assert.equal(state.messages[0].from, 'agent');
    assert.equal(state.messages[0].content[0].text, 'Live answer');
    assert.equal(state.requests[0].type, 'approval_request');
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
      return { ok: true, json: async () => ({ thread: 'thread-1', message: 'message-1', status: 'accepted', cursor: 'thread-1:1', idempotencyKey: 'attempt-1' }) };
    };
    const result = await startThread({ agent: 'agent-1', capability: 'cap-2', readiness: 'ready', canStartThread: true }, {
      messageType: 'action_request', messageContent: { domain: 'example.com' }, idempotencyKey: 'attempt-1', fetchImpl,
    });
    assert.equal(result.thread, 'thread-1');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, {
      targetAgent: 'agent-1', messageType: 'action_request',
      messageContent: { capability: 'cap-2', arguments: { domain: 'example.com' } }, idempotencyKey: 'attempt-1',
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

test('Act follow-up uses the small public typed-message contract', async () => {
  const previous = process.env.DARWIN_ACCESS_TOKEN;
  process.env.DARWIN_ACCESS_TOKEN = 'test-only-token';
  const started = { thread: 'thread-1', cursor: 'thread-1:1' };
  const choice = { capability: 'cap-2' };
  try {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ thread: 'thread-1', message: 'message-2', status: 'accepted', cursor: 'thread-1:2', idempotencyKey: 'msg-1' }) };
    };
    await sendThreadMessage(started, choice, { messageType: 'action_request', messageContent: {}, idempotencyKey: 'msg-1', fetchImpl });
    assert.match(calls[0].url, /\/act\/threads\/thread-1\/messages$/);
    assert.deepEqual(calls[0].body, {
      thread: 'thread-1', messageType: 'action_request',
      messageContent: { capability: 'cap-2', arguments: {} }, idempotencyKey: 'msg-1',
    });
  } finally {
    if (previous === undefined) delete process.env.DARWIN_ACCESS_TOKEN;
    else process.env.DARWIN_ACCESS_TOKEN = previous;
  }
});

test('Act never replays an uncertain typed-message delivery', async () => {
  const previous = process.env.DARWIN_ACCESS_TOKEN;
  process.env.DARWIN_ACCESS_TOKEN = 'test-only-token';
  let sends = 0;
  try {
    await assert.rejects(sendThreadMessage(
      { thread: 'thread-1', cursor: 'thread-1:1' },
      { capability: 'cap-2' },
      { messageType: 'action_request', messageContent: {}, idempotencyKey: 'msg-1', fetchImpl: async () => {
        sends++;
        return { ok: false, status: 503, statusText: 'Service Unavailable',
          json: async () => ({ code: 'THREAD_DELIVERY_RECONCILIATION_REQUIRED' }) };
      } },
    ), (error) => error instanceof DarwinError && error.code === 'THREAD_DELIVERY_RECONCILIATION_REQUIRED');
    assert.equal(sends, 1);
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
      errors: [{ code: 'ACTION_FAILED', retryable: false }] });
  } finally { console.log = originalLog; }
  assert.match(lines.join('\n'), /Provider\/runtime error ACTION_FAILED/);
  assert.match(lines.join('\n'), /No successful external response/);
});

test('Thread reads stop on a failed action without claiming a provider answer', async () => {
  const originalFetch = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async () => {
    reads++;
    return { ok: true, json: async () => ({
      thread: 'thread-1', cursor: 'thread-1:2', hasMore: false, needsAttention: false, requests: [], messages: [],
      actions: [{ action: 'action-1', status: 'failed' }],
    }) };
  };
  try {
    const outcome = await readThread('thread-1', 'thread-1:1');
    assert.deepEqual(outcome.errors.map((error) => error.code), ['ACTION_FAILED']);
    assert.equal(reads, 1);
  } finally { globalThis.fetch = originalFetch; }
});
