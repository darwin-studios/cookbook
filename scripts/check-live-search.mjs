import { choices, search } from '../lib/darwin.mjs';

const scenarios = [
  { name: 'Assistant diagnostic', query: 'MCP server health diagnostic whoami tool', minimumAgents: 1 },
  { name: 'Application readiness', query: 'Edenspiekermann jobs OpenAPI list current job openings', minimumAgents: 1 },
  { name: 'Shopping concierge', query: 'shopping product search agent', minimumAgents: 2 },
  { name: 'Accessibility review', query: 'WCAG accessibility audit website', minimumAgents: 1 },
  { name: 'Security review', query: 'security audit of website URL', minimumAgents: 1 },
];
let failed = false;
const readyByScenario = new Map();
for (const { name, query, minimumAgents } of scenarios) {
  const started = performance.now();
  try {
    const found = await search(query, { numResults: 5 });
    const ranked = choices(found);
    if (!Array.isArray(found.agents) || !Array.isArray(found.results)) throw new Error('Invalid Search response shape');
    const readyAgents = new Set(ranked.filter((item) => item.canStartThread && item.readiness === 'ready').map((item) => item.agent));
    readyByScenario.set(name, readyAgents);
    if (readyAgents.size < minimumAgents) failed = true;
    console.log(`${name}: ${found.outcome}, ${ranked.length} ranked, ${readyAgents.size}/${minimumAgents} executable agents, ${Math.round(performance.now() - started)} ms`);
  } catch (error) {
    failed = true;
    console.error(`${name}: ${error.message} (${Math.round(performance.now() - started)} ms)`);
  }
}
const accessibility = readyByScenario.get('Accessibility review') || new Set();
const security = readyByScenario.get('Security review') || new Set();
if (accessibility.size && security.size && new Set([...accessibility, ...security]).size < 2) {
  failed = true;
  console.error('The release-gate checks need two distinct executable agents.');
}
if (failed) {
  console.error('At least one cookbook recipe lacks the executable agents it needs. Act demos are not ready.');
  process.exitCode = 1;
}
