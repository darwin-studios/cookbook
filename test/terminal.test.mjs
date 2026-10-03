import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

test('non-interactive recipes consume successive piped answers', () => {
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '-e',
    "import { terminal } from './lib/recipe.mjs'; const io = terminal(); console.log(JSON.stringify([await io.ask('first: '), await io.ask('second: ')])); io.close();",
  ], { input: 'one\ntwo\n', encoding: 'utf8' });
  assert.match(output, /\["one","two"\]/);
});
