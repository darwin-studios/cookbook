import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';

async function runWithFakeDarwin(script, answers, respond, { token } = {}) {
  const calls = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const call = {
      method: request.method,
      path: request.url,
      authorization: request.headers.authorization,
      body: body ? JSON.parse(body) : null,
    };
    calls.push(call);
    const result = respond(call, calls);
    response.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(result.body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const env = { ...process.env, DARWIN_API_BASE: `http://127.0.0.1:${server.address().port}` };
    delete env.DARWIN_API_KEY;
    delete env.DARWIN_ACCESS_TOKEN;
    if (token) env.DARWIN_ACCESS_TOKEN = token;
    const child = spawn(process.execPath, [script], {
      cwd: new URL('..', import.meta.url).pathname,
      env, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdin.end(answers);
    const [code] = await once(child, 'exit');
    return { code, stdout, stderr, calls };
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('assistant example makes a real Search-shaped request but never Acts without user OAuth', async () => {
  const result = await runWithFakeDarwin('examples/agentic-assistant.mjs', 'Check SPF and DMARC\n', () => ({
    body: {
      outcome: 'MATCH',
      agents: [{ agent: 'dns-agent', name: 'DNS specialist' }],
      results: [{
        agent: 'dns-agent', capability: 'check-dns', name: 'Check DNS records',
        readiness: 'ready', canStartThread: true,
      }],
    },
  }));
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.calls.map((call) => call.path), ['/search']);
  assert.equal(result.calls[0].body.query, 'Check SPF and DMARC');
  assert.match(result.stdout, /DNS specialist \/ Check DNS records \[READY\]/);
  assert.match(result.stdout, /run-with-oauth\.mjs agentic-assistant/);
});

test('assistant example uses exact Search IDs and prints only a provider result as completion', async () => {
  const result = await runWithFakeDarwin(
    'examples/agentic-assistant.mjs',
    'Check live DNS records\n1\na\n{"domain":"example.com"}\nyes\n',
    (call) => {
      if (call.path === '/search') return { body: {
        outcome: 'MATCH',
        agents: [{ agent: 'dns-agent', name: 'DNS specialist' }],
        results: [{
          agent: 'dns-agent', capability: 'check-dns', name: 'Check DNS records',
          readiness: 'ready', canStartThread: true,
        }],
      } };
      if (call.path === '/act/threads') return { body: {
        thread: 'thread-1', cursor: 'thread-1:1', status: 'accepted',
      } };
      if (call.path.startsWith('/act/threads/thread-1')) return { body: {
        thread: 'thread-1', cursor: 'thread-1:2', hasMore: false,
        messages: [{ from: 'darwin', type: 'result', content: [{ type: 'text', text: 'SPF present' }],
          data: { spf: 'present' } }],
        actions: [], requests: [],
      } };
      throw new Error(`Unexpected API call: ${call.path}`);
    },
    { token: 'test-only-token' },
  );
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.calls.length, 3);
  assert.equal(result.calls[1].authorization, 'Bearer test-only-token');
  assert.deepEqual(result.calls[1].body.messageContent, {
    capability: 'check-dns', arguments: { domain: 'example.com' },
  });
  assert.equal(result.calls[1].body.targetAgent, 'dns-agent');
  assert.match(result.stdout, /Provider: SPF present/);
  assert.match(result.stdout, /"spf": "present"/);
});

test('shopping example compares two distinct provider results without a purchase or Pay call', async () => {
  const result = await runWithFakeDarwin(
    'examples/shopping-concierge.mjs',
    'refurbished MacBook Air M4\nunder $900, warranty\n1,2\nyes\n{"query":"refurbished MacBook Air M4","budget":900}\nyes\n{"query":"refurbished MacBook Air M4","budget":900}\nyes\n',
    (call, calls) => {
      if (call.path === '/search') return { body: {
        outcome: 'MATCH',
        agents: [{ agent: 'shop-a', name: 'Store A' }, { agent: 'shop-b', name: 'Store B' }],
        results: ['shop-a', 'shop-b'].map((agent) => ({
          agent, capability: `${agent}-search`, name: 'product-search',
          description: 'Search shopping results with current prices',
          readiness: 'ready', canStartThread: true,
        })),
      } };
      if (call.path === '/act/threads') return { body: {
        thread: `thread-${calls.filter((entry) => entry.path === '/act/threads').length}`,
        cursor: 'cursor-1', status: 'accepted',
      } };
      if (call.path.startsWith('/act/threads/thread-')) return { body: {
        cursor: 'cursor-2', hasMore: false,
        messages: [{ from: 'darwin', type: 'result', content: [{ type: 'text', text: 'Live product listing' }],
          data: { price: 850, currency: 'USD' } }],
        actions: [], requests: [],
      } };
      throw new Error(`Unexpected API call: ${call.path}`);
    },
    { token: 'test-only-token' },
  );
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.calls.filter((call) => call.path === '/act/threads')
    .map((call) => call.body.targetAgent), ['shop-a', 'shop-b']);
  assert.equal(result.calls.filter((call) => call.path === '/act/threads').length, 2);
  assert.equal(result.calls.filter((call) => call.path.includes('/payments')).length, 0);
  assert.match(result.stdout, /Store A — thread thread-1/);
  assert.match(result.stdout, /Store B — thread thread-2/);
});

test('shopping example broadens provider discovery but does not Act on unavailable matches', async () => {
  const result = await runWithFakeDarwin(
    'examples/shopping-concierge.mjs',
    'refurbished MacBook Air M4\nunder $900, warranty\n',
    (call) => ({
      body: call.body.query === 'product search'
        ? {
          outcome: 'MATCH',
          agents: [{ agent: 'shop-a', name: 'Store A' }],
          results: [{
            agent: 'shop-a', capability: 'search-a', name: 'product-search',
            readiness: 'unavailable', canStartThread: false,
            threadUnavailableReason: 'ROUTE_NOT_APPROVED',
          }],
        }
        : { outcome: 'NO_ELIGIBLE_SUPPLY', agents: [], results: [] },
    }),
  );
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.calls.map((call) => call.body.query),
    ['refurbished MacBook Air M4', 'product search']);
  assert.match(result.stdout, /No eligible route to compare now/);
  assert.equal(result.calls.some((call) => call.path.startsWith('/act/')), false);
});
