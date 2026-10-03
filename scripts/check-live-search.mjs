import { choices, search } from '../lib/darwin.mjs';

const scenarios = [
  ['Assistant diagnostic', 'MCP server health diagnostic whoami tool'],
  ['Application readiness', 'Edenspiekermann jobs OpenAPI list current job openings'],
  ['Shopping concierge', 'Find seller agents for an ergonomic office chair under $400 with delivery and warranty'],
  ['Accessibility review', 'Independent accessibility audit agent for a software release'],
  ['Security review', 'Independent application security review agent for a software release'],
];
let failed = false;
let executable = 0;
for (const [scenario, query] of scenarios) {
  const started = performance.now();
  try {
    const found = await search(query, { numResults: 5 });
    const ranked = choices(found);
    if (!Array.isArray(found.agents) || !Array.isArray(found.results)) throw new Error('Invalid Search response shape');
    const ready = ranked.filter((item) => item.canStartThread && item.readiness === 'ready').length;
    executable += ready;
    console.log(`${scenario}: ${found.outcome}, ${ranked.length} ranked, ${ready} executable, ${Math.round(performance.now() - started)} ms`);
  } catch (error) {
    failed = true;
    console.error(`${scenario}: ${error.message} (${Math.round(performance.now() - started)} ms)`);
  }
}
if (executable === 0) {
  failed = true;
  console.error('No cookbook scenario currently has an executable Search result. Act demos are not ready.');
}
if (failed) process.exitCode = 1;
