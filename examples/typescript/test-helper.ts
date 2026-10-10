import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

export async function runExample(folder: string, answers: string, respond: (call: any) => any, token = '', args: string[] = []) {
  const calls: any[] = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const call = { path: request.url, method: request.method, headers: request.headers, body: raw ? JSON.parse(raw) : null };
    calls.push(call);
    const result = respond(call);
    response.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
    const url = new URL(call.path, 'http://fixture');
    const body = call.method === 'GET' && url.pathname.startsWith('/act/requests/') && (!result.status || result.status === 200)
      ? { type: 'request', actRequestId: 'actreq_1', threads: [{ agentId: 'fixture', threadId: url.searchParams.get('threadId'), state: { thread: url.searchParams.get('threadId'), ...result.body } }] } : result.body;
    response.end(JSON.stringify(body || {}));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const dir = resolve(import.meta.dirname, folder);
  const env: NodeJS.ProcessEnv = { ...process.env, DARWIN_API_BASE: `http://127.0.0.1:${(server.address() as any).port}` };
  delete env.DARWIN_API_KEY;
  delete env.DARWIN_ACCESS_TOKEN;
  if (token) env.DARWIN_ACCESS_TOKEN = token;
  try {
    const child = spawn(resolve(dir, 'node_modules/.bin/tsx'), [resolve(dir, 'index.ts'), ...args], { cwd: dir, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
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
