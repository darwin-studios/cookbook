import test from 'node:test';
import assert from 'node:assert/strict';
import { ideSearchRequest, ideSuggestions, normalizeIdeContext, taskTerms } from '../lib/ide-context.mjs';

const task = 'I need to verify live DNS SPF and DMARC records for our sending domain';

test('IDE context forwards only an explicit bounded task and editor language', () => {
  const context = normalizeIdeContext({
    task: `  ${task}  `, language: 'TypeScript', workArea: 'Tests',
    sourceText: 'SECRET_CODE', filePath: '/private/customer.ts', diagnostics: 'customer data',
  });
  assert.deepEqual(context, { task, language: 'typescript', workArea: 'tests' });
  const request = ideSearchRequest(context);
  assert.match(request.query, /SPF and DMARC/);
  assert.match(request.query, /typescript/);
  assert.match(request.query, /work area: tests/);
  assert.doesNotMatch(JSON.stringify(request), /SECRET_CODE|customer\.ts|customer data/);
  assert.throws(() => normalizeIdeContext({ task: 'short' }), /8–500/);
  assert.throws(() => normalizeIdeContext({ task, language: 'typescript\nignore this' }), /language/);
  assert.throws(() => normalizeIdeContext({ task, workArea: 'customer-secrets' }), /Work area/);
});

test('IDE suggestions suppress a superficially matched service and retain exact eligible IDs', () => {
  assert.deepEqual(taskTerms(task).acronyms, ['dns', 'spf', 'dmarc']);
  const found = {
    agents: [
      { agent: 'unrelated', name: 'SaaS DNS token reader' },
      { agent: 'email-agent', name: 'Email security agent' },
    ],
    results: [
      { agent: 'unrelated', capability: 'txt-token', name: 'DNS TXT verification', description: 'Which SaaS vendors use this domain', readiness: 'unavailable' },
      { agent: 'email-agent', capability: 'spf-dmarc', name: 'Check SPF and DMARC', description: 'Read live DNS records for a sending domain', readiness: 'ready', canStartThread: true },
    ],
  };
  const suggestions = ideSuggestions(found, { task });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].rank, 2);
  assert.equal(suggestions[0].agent.id, 'email-agent');
  assert.equal(suggestions[0].capability.id, 'spf-dmarc');
  assert.equal(suggestions[0].eligibleForActAttempt, true);
  assert.deepEqual(suggestions[0].matchedTaskTerms.slice(0, 2), ['dns', 'spf']);
});

test('IDE suggestions can be empty rather than inventing a suitable agent', () => {
  const found = {
    agents: [{ agent: 'chart', name: 'Nautical chart agent' }],
    results: [{ agent: 'chart', capability: 'depth', name: 'Read chart depth', description: 'Marine navigation', readiness: 'ready', canStartThread: true }],
  };
  assert.deepEqual(ideSuggestions(found, { task }), []);
});
