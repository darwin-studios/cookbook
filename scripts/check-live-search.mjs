import { choices, search } from '../lib/darwin.mjs';
import { isShoppingResearchCandidate } from '../lib/recipe.mjs';

const scenarios = [
  {
    name: 'Developer quickstart email authentication', query: 'MCP tool to check SPF, DMARC, and MTA-STS records for a domain', numResults: 5, minimumAgents: 1,
    relevant: (item) => /spf/i.test(`${item.name} ${item.description}`)
      && /dmarc/i.test(`${item.name} ${item.description}`)
      && /mta.sts/i.test(`${item.name} ${item.description}`),
  },
  {
    name: 'Browse quickstart accessibility', query: 'MCP accessibility audit tool to check a web page for WCAG issues', numResults: 5, minimumAgents: 1,
    relevant: (item) => /accessibility|wcag/i.test(`${item.name} ${item.description}`),
  },
  {
    name: 'Assistant diagnostic', query: 'MCP server health diagnostic whoami tool', numResults: 8,
    objective: 'Find an agent able to complete this exact task: MCP server health diagnostic whoami tool', minimumAgents: 1,
    relevant: (item) => /whoami|health diagnostic/i.test(`${item.name} ${item.description}`),
  },
  {
    name: 'Application readiness', query: 'Edenspiekermann jobs OpenAPI list current job openings',
    objective: 'Find the employer’s executable, read-only capability to list current openings and application requirements.', minimumAgents: 1,
    relevant: (item) => /Edenspiekermann/i.test(item.agentName) && /list current job openings/i.test(item.name),
  },
  {
    name: 'Shopping concierge', query: 'running shoes', category: 'shopping',
    objective: 'Find product-search or price-comparison capabilities, not purchase or checkout', minimumAgents: 2,
    relevant: isShoppingResearchCandidate,
  },
  {
    name: 'Accessibility review', query: 'WCAG accessibility audit website', minimumAgents: 1,
    objective: 'Check WCAG accessibility',
    relevant: (item) => /accessibility|wcag/i.test(`${item.name} ${item.description}`),
  },
  {
    name: 'Security review', query: 'security audit of website URL', minimumAgents: 1,
    objective: 'Check website security headers',
    relevant: (item) => /security|threat|vulnerabilit|security headers/i.test(`${item.name} ${item.description}`),
  },
];
let failed = false;
const readyByScenario = new Map();
for (const { name, query, category, objective, numResults = 10, minimumAgents, relevant } of scenarios) {
  const started = performance.now();
  try {
    const found = await search(query, { category, objective, numResults });
    const ranked = choices(found);
    if (!Array.isArray(found.agents) || !Array.isArray(found.results)) throw new Error('Invalid Search response shape');
    const relevantResults = ranked.filter(relevant);
    const readyAgents = new Set(relevantResults.filter((item) => item.canStartThread && item.readiness === 'ready').map((item) => item.agent));
    readyByScenario.set(name, readyAgents);
    if (readyAgents.size < minimumAgents) failed = true;
    const reasons = [...new Set(relevantResults.filter((item) => !item.canStartThread).map((item) => item.threadUnavailableReason).filter(Boolean))];
    console.log(`${name}: ${found.outcome}, ${ranked.length} ranked, ${relevantResults.length} relevant, ${readyAgents.size}/${minimumAgents} executable agents${reasons.length ? ` (${reasons.join(', ')})` : ''}, ${Math.round(performance.now() - started)} ms`);
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
