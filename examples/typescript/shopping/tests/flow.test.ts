import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runExample } from '../../test-helper.ts';

const found = { outcome: 'MATCH', agents: [{ agent: 'shop-a', name: 'Shop A' }, { agent: 'shop-b', name: 'Shop B' }], results: ['shop-a', 'shop-b'].map((agent) => ({
  agent, capability: `${agent}-search`, name: 'product search', description: 'Search current product offers', readiness: 'ready', canStartThread: true,
})) };

test('compares only two returned provider results and never invokes Pay', async () => {
  let threads = 0;
  const answers = 'MacBook Air M4\nunder $900\n1,2\n{"query":"MacBook Air M4"}\nyes\n{"query":"MacBook Air M4"}\nyes\n';
  const result = await runExample('shopping', answers, (call) => {
    if (call.path === '/search') return { body: found };
    if (call.path === '/act/threads') return { body: { thread: `t${++threads}`, cursor: 'c1' } };
    return { body: { cursor: 'c2', messages: [{ from: 'darwin', type: 'result', content: [{ type: 'text', text: 'Current offer' }], data: { price: 850 } }], actions: [], requests: [] } };
  }, 'test-oauth');
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.calls.filter((call) => call.path === '/act/threads').map((call) => call.body.targetAgent), ['shop-a', 'shop-b']);
  assert.equal(result.calls.some((call) => call.path.includes('/payments')), false);
  assert.match(result.stdout, /Current offer/);
});

test('a payment request requires a separate yes and never auto-charges', async () => {
  const answers = 'MacBook Air M4\nunder $900\n1\n{"query":"MacBook Air M4"}\nyes\nno\n';
  const result = await runExample('shopping', answers, (call) => {
    if (call.path === '/search') return { body: found };
    if (call.path === '/act/threads') return { body: { thread: 't1', cursor: 'c1' } };
    return { body: { cursor: 'c2', messages: [], actions: [], requests: [{ type: 'payment_request', request: 'pay-1', status: 'pending', acceptedMethods: ['hosted_checkout'] }] } };
  }, 'test-oauth');
  assert.equal(result.calls.some((call) => call.path.includes('/payments')), false);
  assert.equal(result.code, 1);
});

test('after comparing, a selected agent can enter one reviewed hosted payment flow', async () => {
  let reads = 0;
  const answers = 'MacBook Air M4\nunder $900\n1\n{"query":"MacBook Air M4"}\nyes\n1\nPlease continue with this offer\nyes\nyes\n\n';
  const result = await runExample('shopping', answers, (call) => {
    if (call.path === '/search') return { body: found };
    if (call.path === '/act/threads') return { body: { thread: 't1', cursor: 'c1' } };
    if (call.path === '/act/threads/t1/messages') return { body: { status: 'accepted' } };
    if (call.path.startsWith('/act/threads/t1?')) return { body: ++reads === 1
      ? { cursor: 'c2', messages: [{ from: 'darwin', type: 'result', data: { price: 850 }, content: [{ type: 'text', text: 'Offer found' }] }], actions: [], requests: [] }
      : reads === 2 ? { cursor: 'c3', messages: [], actions: [], requests: [{ type: 'payment_request', request: 'pay-1', status: 'pending', acceptedMethods: ['hosted_checkout'], amount: 850, currency: 'USD' }] }
        : { cursor: 'c4', messages: [{ from: 'darwin', type: 'result', data: { completed: true }, content: [{ type: 'text', text: 'Provider completed' }] }], actions: [], requests: [] } };
    if (call.path === '/act/payments') return { body: { request: 'pay-1', url: 'https://darwin.so/pay', status: 'selection_required' } };
    throw new Error(`Unexpected ${call.path}`);
  }, 'test-oauth');
  assert.equal(result.code, 0, result.stderr);
  const pays = result.calls.filter((call) => call.path === '/act/payments');
  assert.equal(pays.length, 1);
  assert.equal(pays[0].body.request, 'pay-1');
  assert.equal(pays[0].body.method, undefined);
  assert.match(result.stdout, /Provider completed/);
});
