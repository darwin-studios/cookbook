// Real, read-only production runs of all six maintained starters.
// Provider execution is intentionally separate: use each starter's OAuth command.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const transcriptDir = process.env.DARWIN_LIVE_TRANSCRIPT_DIR
  ? resolve(process.env.DARWIN_LIVE_TRANSCRIPT_DIR)
  : await mkdtemp(join(tmpdir(), 'darwin-cookbook-live-'));
await mkdir(transcriptDir, { recursive: true });
const env = { ...process.env };
delete env.DARWIN_ACCESS_TOKEN; // Never let this read-only suite launch provider work.
delete env.DARWIN_INITIAL_TASK;
const task = 'Find an agent to summarize GitHub issues';
const ideTask = 'Check live DNS SPF and DMARC records for my domain';
const cases = [
  [
    'typescript-general-assistant',
    'examples/typescript/general-assistant/node_modules/.bin/tsx',
    ['examples/typescript/general-assistant/index.ts'],
    `${task}\n`,
  ],
  [
    'typescript-shopping',
    'examples/typescript/shopping/node_modules/.bin/tsx',
    ['examples/typescript/shopping/index.ts'],
    'refurbished MacBook Air M4\nunder $900 with a warranty\n',
  ],
  [
    'typescript-ide',
    'examples/typescript/ide/node_modules/.bin/tsx',
    ['examples/typescript/ide/index.ts', '--once', ideTask],
    '',
  ],
  ['python-general-assistant', 'python3', ['examples/python/general-assistant/main.py'], `${task}\n`],
  [
    'python-shopping',
    'python3',
    ['examples/python/shopping/main.py'],
    'refurbished MacBook Air M4\nunder $900 with a warranty\n',
  ],
  ['python-ide', 'python3', ['examples/python/ide/main.py', '--once', ideTask], ''],
];
let failed = false;
for (const [label, command, args, input] of cases) {
  const started = Date.now();
  const result = await new Promise((resolveResult) => {
    const child = spawn(command.includes('/') ? resolve(root, command) : command, args, {
      cwd: root,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    const timeout = setTimeout(() => child.kill('SIGTERM'), 120_000);
    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    child.on('error', (error) => {
      stderr += error.message;
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolveResult({ code, stdout, stderr });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
  const transcript = join(transcriptDir, `${label}.txt`);
  await writeFile(transcript, `READ-ONLY LIVE SEARCH\n${result.stdout}\n${result.stderr}`, { mode: 0o600 });
  console.log(JSON.stringify({ label, exitCode: result.code, elapsedMs: Date.now() - started, transcript }));
  if (result.code !== 0) failed = true;
}
if (failed) process.exitCode = 1;
