import { choices, search } from '../lib/darwin.mjs';
import { searchLatencyBudgetMs, searchLatencyPasses } from '../lib/preflight.mjs';
import { findCandidates, isAccessibilityAuditCandidate, isShoppingResearchCandidate } from '../lib/recipe.mjs';
import { ideSearchRequest } from '../lib/ide-context.mjs';

const ideTask = 'I am building a SaaS signup flow and need to verify live DNS SPF, DMARC, and MTA-STS records for our sending domain';
const ideRequest = ideSearchRequest({ task: ideTask, language: 'typescript', workArea: 'implementation' });

const scenarios = [
  {
    name: 'Developer quickstart email authentication', query: 'email security posture from live DNS SPF DMARC MTA-STS', numResults: 5, minimumAgents: 1,
    requireRelevantFirst: true,
    relevant: (item) => !/price|checkout|paid roster/i.test(`${item.name} ${item.description}`)
      && /spf/i.test(`${item.name} ${item.description}`)
      && /dmarc/i.test(`${item.name} ${item.description}`)
      && /mta.sts/i.test(`${item.name} ${item.description}`),
  },
  {
    name: 'Browse quickstart accessibility', query: 'MCP accessibility audit tool to check a web page for WCAG issues', numResults: 5, minimumAgents: 1,
    requireRelevantFirst: true,
    relevant: isAccessibilityAuditCandidate,
  },
  {
    name: 'Browse Search guide invoice extraction', query: 'invoice PDF or image extraction with line items and validated totals as structured JSON',
    numResults: 5, minimumAgents: 0, requireRelevantFirst: true,
    relevant: (item) => /invoice/i.test(`${item.name} ${item.description}`)
      && /pdf|image/i.test(`${item.name} ${item.description}`)
      && /line items?/i.test(`${item.name} ${item.description}`)
      && /validat|check.*total/i.test(`${item.name} ${item.description}`)
      && /json/i.test(`${item.name} ${item.description}`),
  },
  {
    name: 'General assistant diagnostic task', query: 'MCP server health diagnostic whoami tool', numResults: 8,
    objective: 'Find an agent able to complete this exact task: MCP server health diagnostic whoami tool', minimumAgents: 1,
    relevant: (item) => /whoami|health diagnostic/i.test(`${item.name} ${item.description}`),
  },
  {
    name: 'IDE suggestions email-security task', query: ideRequest.query, objective: ideRequest.objective, numResults: 8, minimumAgents: 1,
    relevant: (item) => /spf/i.test(`${item.name} ${item.description}`) && /dmarc/i.test(`${item.name} ${item.description}`),
  },
  {
    name: 'Shopping comparison', query: 'refurbished MacBook Air M4', category: 'shopping', fallbackQuery: 'product search',
    objective: 'Find product-search or price-comparison capabilities, not purchase or checkout', minimumAgents: 2,
    relevant: isShoppingResearchCandidate,
  },
];
let failed = false;
for (const { name, query, category, objective, fallbackQuery, numResults = 10, minimumAgents, requireRelevantFirst = false, relevant } of scenarios) {
  const started = performance.now();
  try {
    const found = fallbackQuery
      ? await findCandidates(query, objective, { category, fallbackQuery, select: relevant })
      : await search(query, { category, objective, numResults });
    const ranked = fallbackQuery ? found.ranked : choices(found);
    if (!fallbackQuery && (!Array.isArray(found.agents) || !Array.isArray(found.results))) throw new Error('Invalid Search response shape');
    const relevantResults = ranked.filter(relevant);
    const firstIsRelevant = Boolean(ranked[0] && relevant(ranked[0]));
    const readyAgents = new Set(relevantResults.filter((item) => item.canStartThread && item.readiness === 'ready').map((item) => item.agent));
    const recheckAgents = new Set(relevantResults.filter((item) => item.canAttemptThread && item.readiness === 'recheck_available').map((item) => item.agent));
    const elapsedMs = Math.round(performance.now() - started);
    const latencyOptions = { broadened: Boolean(found.broadened) };
    const fastEnough = searchLatencyPasses(elapsedMs, latencyOptions);
    if (readyAgents.size < minimumAgents || (requireRelevantFirst && !firstIsRelevant) || !fastEnough) failed = true;
    const reasons = [...new Set(relevantResults.filter((item) => !item.canStartThread).map((item) => item.threadUnavailableReason).filter(Boolean))];
    console.log(`${name}: ${found.outcome}${found.broadened ? ' (broadened provider discovery)' : ''}, ${ranked.length} ranked, ${relevantResults.length} relevant${requireRelevantFirst ? `, first result ${firstIsRelevant ? 'relevant' : 'NOT relevant'}` : ''}, ${minimumAgents ? `${readyAgents.size}/${minimumAgents} executable agents, ${recheckAgents.size} first-use rechecks (not yet proven)` : 'Search-only example; Act not required'}${reasons.length ? ` (${reasons.join(', ')})` : ''}, ${elapsedMs} ms${fastEnough ? '' : ` (SLOW: over ${searchLatencyBudgetMs(latencyOptions)} ms budget)`}`);
  } catch (error) {
    failed = true;
    console.error(`${name}: ${error.message} (${Math.round(performance.now() - started)} ms)`);
  }
}
if (failed) {
  console.error('At least one cookbook or Quickstart scenario is slow, lacks relevant top results, or lacks the executable agents it needs. Review the scenario results above before a live demo.');
  process.exitCode = 1;
}
