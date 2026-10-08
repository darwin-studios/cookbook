import { choices, search } from '../lib/darwin.mjs';

const cases = [
  ['General assistant', 'Find an agent to summarize GitHub issues'],
  ['Shopping comparison', 'Find product-search agents to compare refurbished MacBook Air M4 offers under $900'],
  ['IDE suggestions', 'Find an agent that checks live DNS SPF and DMARC records for my domain'],
];
let failed = false;
for (const [label, query] of cases) {
  const start = performance.now();
  try {
    const result = await search(query, { maxResults: 5 });
    const agents = choices(result);
    if (!agents.every((a) => a.agentId && a.capabilityId && a.connectionPrompt?.includes('index.darwin.so/agent/')))
      throw new Error('Missing IDs or connection prompt');
    console.log(
      JSON.stringify({
        label,
        status: result.status,
        searchId: result.searchId,
        agents: agents.length,
        actEligible: agents.filter((a) => a.canStartThread).length,
        question: result.response.question,
        noMatchReason: result.response.noMatchReason,
        elapsedMs: Math.round(performance.now() - start),
      }),
    );
  } catch (error) {
    failed = true;
    console.error(`${label}: ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
