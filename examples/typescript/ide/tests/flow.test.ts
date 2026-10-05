import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runExample } from '../../test-helper.ts';

test('IDE worker searches approved summary only and never invokes Act', async () => {
  const result = await runExample('ide', '', () => ({ body: { outcome: 'MATCH', agents: [], results: [] } }), '',
    ['--once', 'check live SPF and DMARC records for my domain']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.calls.map((call) => call.path), ['/search']);
  assert.match(result.calls[0].body.query, /SPF and DMARC/);
  assert.match(result.stdout, /"type":"suggestions"/);
});

test('stream ignores source text and uses only the approved task context', async () => {
  const input = JSON.stringify({ task: 'check live SPF and DMARC records for my domain', language: 'typescript', source: 'SECRET_SOURCE_DO_NOT_SEND' }) + '\n';
  const result = await runExample('ide', input, () => ({ body: { outcome: 'MATCH', agents: [], results: [] } }));
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(result.calls[0].body), /SECRET_SOURCE_DO_NOT_SEND/);
  assert.match(result.stdout, /"type":"suggestions"/);
});
