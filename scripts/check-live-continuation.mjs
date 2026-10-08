import assert from 'node:assert/strict';

import { choices, search } from '../lib/darwin.mjs';

const first = await search('Find an agent to summarize GitHub issues', { maxResults: 3 });
const next = await search('Focus on open bugs updated this week', {
  previousResponseId: first.responseId,
  context: [{ type: 'text', text: 'Prepare a weekly engineering review' }],
});
assert.equal(next.searchId, first.searchId);
assert.equal(next.previousResponseId, first.responseId);
assert.notEqual(next.responseId, first.responseId);
console.log(
  JSON.stringify({
    check: 'production Search continuation',
    searchId: next.searchId,
    firstResponseId: first.responseId,
    nextResponseId: next.responseId,
    status: next.status,
    agents: next.response.agents.length,
  }),
);
const agent = choices(next)[0] || choices(first)[0];
if (!agent) throw new Error('No agent available to verify an external handoff link');
const url = agent.connectionPrompt.match(/https:\/\/index\.darwin\.so\/agent\/[^\s)"<>]+/)?.[0]?.replace(/[.,]+$/, '');
if (!url) throw new Error('Connection prompt is missing its canonical index link');
const page = await fetch(url, { signal: AbortSignal.timeout(30_000) });
assert.equal(page.status, 200);
console.log(
  JSON.stringify({ check: 'production connection prompt link', agentId: agent.agentId, url, httpStatus: page.status }),
);
