import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import test from 'node:test';

import { found as searchFixture, started } from './fixtures.mjs';

test(
  'stdio IDE worker searches once for approved context without uploading source text',
  { timeout: 10_000 },
  async () => {
    const requests = [];
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify(
          searchFixture([
            {
              agentId: 'agent-1',
              capabilityId: 'cap-1',
              name: 'Check SPF and DMARC',
              description: 'Read DNS records for a sending domain',
              readiness: 'ready',
              canStartThread: true,
            },
          ]),
        ),
      );
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const child = spawn(process.execPath, [resolve('examples/ide-companion.mjs'), '--stream'], {
      env: { ...process.env, DARWIN_API_BASE: `http://127.0.0.1:${server.address().port}` },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    try {
      const nextSuggestions = new Promise((done, fail) => {
        let buffer = '';
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
          buffer += chunk;
          let newline;
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            const event = JSON.parse(line);
            if (event.type === 'suggestions') done(event);
          }
        });
        child.on('error', fail);
        child.on('exit', (code) => fail(new Error(`Worker exited before suggesting: ${code}`)));
      });
      const event = {
        task: 'Check DNS SPF and DMARC for our sending domain',
        language: 'typescript',
        workArea: 'tests',
        sourceText: 'SECRET_SOURCE_TEXT',
        filePath: '/private/customer.ts',
      };
      child.stdin.write(`${JSON.stringify(event)}\n`);
      child.stdin.write(`${JSON.stringify(event)}\n`); // duplicate editor event is coalesced
      const result = await nextSuggestions;
      assert.equal(result.suggestions.length, 1);
      assert.equal(result.suggestions[0].capability.id, 'cap-1');
      assert.equal(result.suggestions[0].eligibleForActAttempt, true);
      assert.equal(requests.length, 1);
      assert.doesNotMatch(JSON.stringify(requests), /SECRET_SOURCE_TEXT|customer\.ts/);
    } finally {
      child.kill();
      await new Promise((done) => server.close(done));
    }
  },
);

test(
  'reviewed IDE Act path uses OAuth, exact capability, and a real thread result shape',
  { timeout: 10_000 },
  async () => {
    const calls = [];
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
      calls.push({ path: request.url, method: request.method, authorization: request.headers.authorization, body });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      if (request.url === '/search') {
        response.end(
          JSON.stringify(
            searchFixture([
              {
                agentId: 'agent-1',
                capabilityId: 'cap-1',
                name: 'Check SPF and DMARC',
                description: 'Read live DNS records',
                readiness: 'ready',
                canStartThread: true,
              },
            ]),
          ),
        );
      } else if (request.url === '/act' && !body.threadId) {
        response.end(JSON.stringify(started('agent-1', 'thread-1')));
      } else if (request.url.startsWith('/act/requests/actreq_1?')) {
        response.end(
          JSON.stringify({ ...started('agent-1','thread-1'), threads: [{ agentId: 'agent-1', threadId: 'thread-1', state: { thread: 'thread-1',
            cursor: 'cursor-2',
            hasMore: false,
            actions: [],
            requests: [],
            messages: [
              {
                from: 'darwin',
                type: 'result',
                content: [{ type: 'text', text: 'SPF and DMARC checked by provider' }],
              },
            ],
          } }] }),
        );
      } else {
        response.writeHead(404).end();
      }
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const child = spawn(process.execPath, [resolve('examples/ide-companion.mjs'), '--act'], {
      env: {
        ...process.env,
        DARWIN_API_BASE: `http://127.0.0.1:${server.address().port}`,
        DARWIN_ACCESS_TOKEN: 'test-oauth-token',
        DARWIN_IDE_TASK: 'Check DNS SPF and DMARC for our sending domain',
        DARWIN_IDE_LANGUAGE: 'typescript',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk;
    });
    try {
      child.stdin.end('1\na\n{}\nyes\n');
      const exitCode = await new Promise((done, fail) => {
        child.on('exit', done);
        child.on('error', fail);
      });
      assert.equal(exitCode, 0, stderr);
      assert.match(stdout, /SPF and DMARC checked by provider/);
      assert.equal(calls.length, 3);
      assert.equal(calls[1].authorization, 'Bearer test-oauth-token');
      assert.deepEqual(calls[1].body.targets[0].arguments, {});
    } finally {
      child.kill();
      await new Promise((done) => server.close(done));
    }
  },
);
