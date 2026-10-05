import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchOAuthJson } from '../lib/oauth.mjs';

const recipe = process.argv[2];
const cookbookRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modern = {
  'general-assistant': 'general-assistant',
  shopping: 'shopping',
  ide: 'general-assistant',
};
if (!recipe || ![...Object.keys(modern), 'agentic-assistant', 'ide-companion', 'shopping-concierge'].includes(recipe)) {
  console.error('Usage: node scripts/run-with-oauth.mjs <general-assistant|shopping|ide>');
  process.exit(2);
}
const modernFolder = modern[recipe];
const tsx = modernFolder && resolve(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'typescript', modernFolder, 'node_modules', '.bin', 'tsx');
if (tsx && !existsSync(tsx)) throw new Error(`Install the TypeScript example first: cd examples/typescript/${modernFolder} && npm install`);
const issuer = 'https://darwin.so/api/customer/auth';
const metadata = await fetchOAuthJson(`${issuer}/.well-known/openid-configuration`, { label: 'OAuth discovery' });
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(24).toString('base64url');

let finish;
let fail;
const callback = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname !== '/callback') { response.writeHead(404).end(); return; }
  if (url.searchParams.get('state') !== state) {
    response.writeHead(400).end('OAuth state mismatch.');
    fail(new Error('OAuth state mismatch'));
    return;
  }
  const code = url.searchParams.get('code');
  if (!code) {
    response.writeHead(400).end('Authorization was not completed.');
    fail(new Error(url.searchParams.get('error') || 'Authorization was not completed'));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Darwin authorized. Return to the terminal; you may close this tab.');
  finish(code);
});
await new Promise((resolve) => server.listen(0, 'localhost', resolve));
const redirectUri = `http://localhost:${server.address().port}/callback`;

try {
  const registration = await fetchOAuthJson(metadata.registration_endpoint, {
    label: 'OAuth client registration',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Darwin cookbook local test',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'openid profile directory:read human:actions',
    }),
  });
  if (!registration.client_id) throw new Error('OAuth registration omitted client_id');
  const authorize = new URL(metadata.authorization_endpoint);
  for (const [key, value] of Object.entries({
    response_type: 'code', client_id: registration.client_id, redirect_uri: redirectUri,
    scope: 'openid profile directory:read human:actions', state,
    code_challenge: challenge, code_challenge_method: 'S256',
    resource: 'https://api.darwin.so/api/v2',
  })) authorize.searchParams.set(key, value);
  console.log(`Open this Darwin consent URL in your browser:\n${authorize}\n`);
  const timer = setTimeout(() => fail(new Error('OAuth consent timed out after 10 minutes')), 600_000);
  const code = await callback.finally(() => clearTimeout(timer));
  const token = await fetchOAuthJson(metadata.token_endpoint, {
    label: 'OAuth token exchange',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri,
      client_id: registration.client_id, code_verifier: verifier,
      resource: 'https://api.darwin.so/api/v2' }),
  });
  if (!token.access_token) throw new Error('OAuth token response omitted access_token');
  console.log('OAuth succeeded. Running the recipe; the token stays in this process and its child.');
  const command = tsx || process.execPath;
  const args = tsx
    ? [resolve(cookbookRoot, 'examples', 'typescript', modernFolder, 'index.ts')]
    : [resolve(cookbookRoot, 'examples', `${recipe}.mjs`), ...(recipe === 'ide-companion' ? ['--act'] : [])];
  const child = spawn(command, args, {
    cwd: cookbookRoot, stdio: 'inherit', env: { ...process.env, DARWIN_ACCESS_TOKEN: token.access_token,
      ...(recipe === 'ide' ? { DARWIN_INITIAL_TASK: process.env.DARWIN_IDE_TASK || '' } : {}) },
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  server.close();
}
