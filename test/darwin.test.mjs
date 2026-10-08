import assert from 'node:assert/strict';
import test from 'node:test';

import {
  act,
  canRequestThread,
  choices,
  DarwinError,
  getThread,
  request,
  search,
  sendThreadMessage,
  startThread,
} from '../lib/darwin.mjs';
import {
  hasProviderResult,
  isAccessibilityAuditCandidate,
  isShoppingResearchCandidate,
  providerMessages,
  readThread,
  reviewPending,
} from '../lib/recipe.mjs';
import { found, responseId, searchId, started } from './fixtures.mjs';

const ok = (data) => ({ ok: true, json: async () => data });
async function withToken(run) {
  const old = process.env.DARWIN_ACCESS_TOKEN;
  process.env.DARWIN_ACCESS_TOKEN = 'test-only';
  try {
    await run();
  } finally {
    if (old === undefined) delete process.env.DARWIN_ACCESS_TOKEN;
    else process.env.DARWIN_ACCESS_TOKEN = old;
  }
}

test('Search sends only current inputs and preserves the public response and prompt', async () => {
  const result = found([{}]);
  const actual = await search('Check DNS', {
    maxResults: 3,
    context: [{ type: 'text', text: 'example.com' }],
    fetchImpl: async (url, o) => {
      assert.match(url, /\/v3\/search$/);
      assert.deepEqual(JSON.parse(o.body), {
        query: 'Check DNS',
        agentCount: 'auto',
        maxResults: 3,
        context: [{ type: 'text', text: 'example.com' }],
      });
      return ok(result);
    },
  });
  assert.deepEqual(actual, result);
  const choice = choices(actual)[0];
  assert.equal(choice.searchId, searchId);
  assert.equal(choice.agent, 'dns-agent');
  assert.match(choice.connectionPrompt, /index.darwin.so/);
});
test('anonymous follow-up carries the owner token and new context', async () => {
  await search('Check DNS', { fetchImpl: async () => ok(found([], { searchToken: 'owner-token' })) });
  await search('Use example.com', {
    previousResponseId: responseId,
    context: [{ type: 'budget', amountMinor: 500, currency: 'USD' }],
    fetchImpl: async (_u, o) => {
      assert.equal(o.headers['X-Search-Token'], 'owner-token');
      assert.equal(JSON.parse(o.body).previousResponseId, responseId);
      assert.equal(JSON.parse(o.body).context[0].type, 'budget');
      return ok(found([{}]));
    },
  });
});
test('Search rejects invalid result count and malformed response', async () => {
  await assert.rejects(search('x', { maxResults: 21 }), /1–20/);
  await assert.rejects(search('x', { fetchImpl: async () => ok({ agents: [] }) }), /Invalid Search response/);
});
test('Search-to-Act uses searchId, exact selected agent, arguments and header idempotency', async () =>
  withToken(async () => {
    const choice = { ...choices(found([{}]))[0], query: 'Check DNS' };
    const r = await startThread(choice, {
      messageType: 'action_request',
      messageContent: { domain: 'example.com' },
      idempotencyKey: 'attempt-1',
      fetchImpl: async (u, o) => {
        assert.match(u, /\/v3\/act$/);
        assert.equal(o.headers['Idempotency-Key'], 'attempt-1');
        assert.deepEqual(JSON.parse(o.body), {
          searchId,
          agentIds: ['dns-agent'],
          message: 'Check DNS',
          arguments: { 'dns-agent': { domain: 'example.com' } },
        });
        return ok(started());
      },
    });
    assert.equal(r.thread, 't1');
  }));
test('direct Act uses exact target IDs without inventing a Search session', async () =>
  withToken(async () => {
    await startThread(
      { agent: 'dns-agent', capability: 'check-dns', name: 'Check DNS', readiness: 'ready', canStartThread: true },
      {
        messageType: 'message',
        messageContent: 'Hello',
        fetchImpl: async (_u, o) => {
          assert.deepEqual(JSON.parse(o.body), {
            targets: [{ agentId: 'dns-agent', capabilityId: 'check-dns' }],
            message: 'Hello',
          });
          return ok(started());
        },
      },
    );
  }));
test('HTTP 200 target failure is an error, not an accepted thread', async () =>
  withToken(async () => {
    await assert.rejects(
      startThread(choices(found([{}]))[0], {
        messageType: 'message',
        messageContent: 'Hello',
        fetchImpl: async () =>
          ok({ ...started(), status: 'failed', threads: [{ agentId: 'dns-agent', errorCode: 'ROUTE_UNAVAILABLE' }] }),
      }),
      (e) => e.code === 'ROUTE_UNAVAILABLE',
    );
  }));
test('unavailable results and application-only credentials never send Act', async () => {
  assert.equal(canRequestThread({ readiness: 'unavailable', canStartThread: false }), false);
  assert.equal(canRequestThread({ readiness: 'recheck_required', canStartThread: false }), true);
  const old = process.env.DARWIN_ACCESS_TOKEN;
  delete process.env.DARWIN_ACCESS_TOKEN;
  try {
    await assert.rejects(act({}), /OAuth/);
  } finally {
    if (old !== undefined) process.env.DARWIN_ACCESS_TOKEN = old;
  }
});
test('text and action follow-ups use the same POST Act endpoint', async () =>
  withToken(async () => {
    for (const [type, content, expected] of [
      ['message', '  Hello  ', { type: 'text', text: 'Hello' }],
      ['action_request', {}, { type: 'action_request', capabilityId: 'check-dns', arguments: {} }],
    ]) {
      await sendThreadMessage(
        { thread: 't1' },
        { capability: 'check-dns' },
        {
          messageType: type,
          messageContent: content,
          idempotencyKey: 'same-key',
          fetchImpl: async (u, o) => {
            assert.match(u, /\/act$/);
            assert.deepEqual(JSON.parse(o.body), { threadId: 't1', message: expected });
            assert.equal(o.headers['Idempotency-Key'], 'same-key');
            return ok({ type: 'continuation', threadId: 't1', result: {} });
          },
        },
      );
    }
  }));
test('mutations never replay an uncertain delivery', async () =>
  withToken(async () => {
    let calls = 0;
    await assert.rejects(
      act(
        { threadId: 't1', message: { type: 'text', text: 'Hello' } },
        {
          fetchImpl: async () => {
            calls++;
            return {
              ok: false,
              status: 503,
              statusText: 'Unavailable',
              json: async () => ({ code: 'THREAD_DELIVERY_RECONCILIATION_REQUIRED' }),
            };
          },
        },
      ),
      (e) => e instanceof DarwinError,
    );
    assert.equal(calls, 1);
  }));
test('GET thread uses cursor and no unsupported wait parameter', async () => {
  await getThread('t1', {
    cursor: 'c:1',
    wait: true,
    fetchImpl: async (u) => {
      assert.match(u, /\/act\/threads\/t1\?cursor=c%3A1$/);
      return ok({ messages: [], requests: [] });
    },
  });
});
test('only provider results count as completed work', () => {
  assert.equal(hasProviderResult([{ from: 'you', type: 'message' }]), false);
  assert.equal(hasProviderResult([{ from: 'agent', type: 'message' }]), false);
  assert.equal(hasProviderResult([{ from: 'darwin', type: 'result' }]), true);
  assert.equal(providerMessages([{ from: 'you', type: 'message' }]).length, 0);
});
test('pending auth and payment use typed Act continuation and preserve receipt', async () =>
  withToken(async () => {
    const old = globalThis.fetch;
    try {
      for (const type of ['authentication_request', 'payment_request']) {
        globalThis.fetch = async (u, o) => {
          assert.match(u, /\/act$/);
          const b = JSON.parse(o.body);
          assert.equal(b.threadId, 't1');
          assert.equal(b.message.requestId, 'request-1');
          assert.equal(b.message.type, type === 'payment_request' ? 'payment_response' : 'authentication_response');
          if (type === 'payment_request') assert.equal(b.message.method, 'hosted_checkout');
          return ok({ type: 'continuation', threadId: 't1', result: { status: 'denied' } });
        };
        await reviewPending({ ask: async () => 'yes' }, { thread: 't1', pending: [{ type, request: 'request-1' }] });
      }
    } finally {
      globalThis.fetch = old;
    }
  }));
test('thread reads stop on pending review or failed actions', async () => {
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      ok({ cursor: 'c2', messages: [], actions: [{ action: 'a1', status: 'failed' }], requests: [] });
    const r = await readThread('t1');
    assert.equal(r.errors[0].code, 'ACTION_FAILED');
  } finally {
    globalThis.fetch = old;
  }
});
test('recipe selection excludes purchases and sales-only audits', () => {
  assert.equal(isShoppingResearchCandidate({ name: 'product-search', description: 'Google Shopping results' }), true);
  assert.equal(isShoppingResearchCandidate({ name: 'Checkout', description: 'Purchase a product' }), false);
  assert.equal(
    isAccessibilityAuditCandidate({ name: 'audit_site_accessibility', description: 'Scan URL for WCAG issues' }),
    true,
  );
  assert.equal(
    isAccessibilityAuditCandidate({ name: 'WCAG audit offering', description: 'Consulting pricing bands' }),
    false,
  );
});
