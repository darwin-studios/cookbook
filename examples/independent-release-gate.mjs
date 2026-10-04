import { chosenReady, discover, hasProviderResult, invokeCapability, isAccessibilityAuditCandidate, isDistinctAgent, isSecurityHeadersCandidate, showOutcome, terminal } from '../lib/recipe.mjs';
import { canRequestThread } from '../lib/darwin.mjs';

// Product idea: a release workflow that sources independent specialist checks
// from the network rather than wiring one fixed audit vendor into CI.
const io = terminal();
try {
  console.log('Independent release gate — request accessibility and security-header checks before shipping a website.');
  const artifact = await io.ask('Public website URL to review: ');
  if (!artifact) process.exit(0);
  if ((await io.ask('Do you own this asset or have permission to test it? Type yes: ')) !== 'yes') {
    console.log('No external review requested.');
    process.exit(0);
  }
  const checks = [
    { label: 'Accessibility', query: 'MCP accessibility audit tool to check a web page for WCAG issues', objective: 'Run a live page accessibility check, not describe a consulting offering', select: isAccessibilityAuditCandidate },
    { label: 'Security', query: 'website security headers scanner', objective: 'Check website security headers', select: isSecurityHeadersCandidate },
  ];
  const outcomes = [];
  for (const check of checks) {
    const ranked = await discover(check.label, check.query, check.objective, { select: check.select });
    if (!ranked.some(canRequestThread)) continue;
    const number = await io.ask(`Choose one READY or RECHECK ${check.label.toLowerCase()} capability (Enter to skip): `);
    if (!number) continue;
    const choice = chosenReady(ranked, number);
    if (!isDistinctAgent(outcomes, choice)) {
      console.log('Choose a different agent for the second review; two tools from one agent are not independent.');
      continue;
    }
    console.log(`Request a read-only review of ${artifact}. Supply only arguments allowed by the advertised capability.`);
    const outcome = await invokeCapability(io, choice, check.label);
    if (outcome) outcomes.push({ label: check.label, agent: choice.agent, outcome });
  }
  console.log('\nRelease evidence — no simulated audit verdicts or automatic deployment.');
  for (const { label, outcome } of outcomes) showOutcome(label, outcome);
  if (outcomes.length < checks.length || outcomes.some(({ outcome }) => outcome.errors?.length || !hasProviderResult(outcome.messages))) {
    throw new Error('Both independent checks need external responses; this release is not fully reviewed.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  io.close();
}
