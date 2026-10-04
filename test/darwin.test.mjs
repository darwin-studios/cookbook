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
    { sender: 'acting_ai', payload: { type: 'message', parts: [{ type: 'text', text: 'sent' }] } },
    { sender: 'runtime', payload: { type: 'delivery_status', status: 'accepted' } },
    { sender: 'target_ai', payload: { type: 'message', parts: [{ type: 'text', text: 'actual-response' }] } },
  ]).map((event) => event.payload.parts[0].text), ['actual-response']);
});

test('Darwin-relayed operation results count as outcomes, not just agent-authored messages', () => {
  assert.deepEqual(providerMessages([
    { sender: 'runtime', payload: { type: 'result', parts: [{ type: 'text', text: 'External tool answered' }], data: { answered_by: { tool: 'whoami' } } } },
  ]).map((event) => event.payload.type), ['result']);
});

test('An interim agent message is not a completed action result', () => {
  assert.equal(hasProviderResult([{ sender: 'target_ai', payload: { type: 'message', parts: [{ type: 'text', text: 'Working on it' }] } }]), false);
  assert.equal(hasProviderResult([{ sender: 'runtime', payload: { type: 'result', parts: [{ type: 'text', text: 'Done' }] } }]), true);
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

test('Thread reads use the canonical cursor and preserve real provider events', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(url, /\/act\/threads\/thread-1\?afterCursor=thread-1%3A1&waitMs=30000$/);
    return { ok: true, json: async () => ({
      cursor: 'thread-1:3', hasMore: false, attention: true,
      events: [{ sender: 'target_ai', payload: { type: 'result', parts: [{ type: 'text', text: 'Live answer' }], data: { source: 'provider' } } }],
      requests: { approval: { id: 'approval', kind: 'approval_request', operationId: 'op-1' } },
    }) };
  };
  try {
    const state = await getThread('thread-1', { afterCursor: 'thread-1:1', wait: true });
    assert.equal(state.events[0].sender, 'target_ai');
    assert.equal(state.events[0].payload.parts[0].text, 'Live answer');
    assert.equal(state.requests.approval.kind, 'approval_request');
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
      return { ok: true, json: async () => ({ threadId: 'thread-1', revision: 1, cursor: 'thread-1:1', capabilities: [{ capabilityId: 'cap-2' }] }) };
    };
    const result = await startThread({ agent: 'agent-1', capability: 'cap-2', readiness: 'ready', canStartThread: true }, {
      idempotencyKey: 'attempt-1', fetchImpl,
    });
    assert.equal(result.threadId, 'thread-1');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, {
      targetAiId: 'agent-1', capabilityId: 'cap-2', idempotencyKey: 'attempt-1',
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
      idempotencyKey: 'attempt-1', fetchImpl,
    }), (error) => error instanceof DarwinError && error.code === 'THREAD_DELIVERY_RECONCILIATION_REQUIRED');
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].idempotencyKey, 'attempt-1');
  } finally {
    if (previous === undefined) delete process.env.DARWIN_ACCESS_TOKEN;
    else process.env.DARWIN_ACCESS_TOKEN = previous;
  }
});

test('Act sends a typed event with the selected capability and thread revision', async () => {
  const previous = process.env.DARWIN_ACCESS_TOKEN;
  process.env.DARWIN_ACCESS_TOKEN = 'test-only-token';
  const started = { threadId: 'thread-1', revision: 1, capabilities: [{ capabilityId: 'cap-2' }] };
  const choice = { capability: 'cap-2' };
  try {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ accepted: true, eventId: 'event-1', cursor: 'thread-1:2' }) };
    };
    await sendThreadMessage(started, choice, { messageType: 'action_request', messageContent: {}, clientMessageId: 'msg-1', fetchImpl });
    assert.match(calls[0].url, /\/act\/threads\/thread-1\/messages$/);
    assert.deepEqual(calls[0].body, {
      clientMessageId: 'msg-1', expectedRevision: 1,
      event: { type: 'action_request', capabilityId: 'cap-2', arguments: {} },
    });
    await assert.rejects(sendThreadMessage(started, { capability: 'wrong' }, {
      messageType: 'action_request', messageContent: {}, fetchImpl,
    }), /did not advertise/);
    assert.equal(calls.length, 1);
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
      { threadId: 'thread-1', revision: 1, capabilities: [{ capabilityId: 'cap-2' }] },
      { capability: 'cap-2' },
      { messageType: 'action_request', messageContent: {}, clientMessageId: 'msg-1', fetchImpl: async () => {
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
    showOutcome('Specialist', { thread: 'thread-1', events: [],
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
      cursor: 'thread-1:2', hasMore: false, attention: false, requests: {},
      events: [{ sender: 'target_ai', payload: { type: 'error', code: 'MCP_TOOL_ERROR', retryable: false } }],
    }) };
  };
  try {
    const outcome = await readThread('thread-1', 'thread-1:1');
    assert.deepEqual(outcome.errors.map((error) => error.code), ['MCP_TOOL_ERROR']);
    assert.equal(reads, 1);
  } finally { globalThis.fetch = originalFetch; }
});
