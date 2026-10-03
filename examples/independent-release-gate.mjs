import { chosenReady, discover, invokeCapability, showOutcome, terminal } from '../lib/recipe.mjs';

// Product idea: a release workflow that sources independent specialist checks
// from the network rather than wiring one fixed audit vendor into CI.
const io = terminal();
try {
  console.log('Independent release gate — request two distinct outside reviews before shipping.');
  const artifact = await io.ask('What is being released (public URL, repository, or short description)? ');
  if (!artifact) process.exit(0);
  if ((await io.ask('Do you own this asset or have permission to test it? Type yes: ')) !== 'yes') {
    console.log('No external review requested.');
    process.exit(0);
  }
  const checks = [
    { label: 'Accessibility', query: `Independent accessibility audit agent for ${artifact}`, objective: 'Identify concrete accessibility failures with evidence and severity.' },
    { label: 'Security', query: `Independent application security review agent for ${artifact}`, objective: 'Identify concrete security risks with evidence and severity; do not modify the target.' },
  ];
  const outcomes = [];
  for (const check of checks) {
    const ranked = await discover(check.label, check.query, check.objective);
    if (!ranked.some((item) => item.canStartThread && item.readiness === 'ready')) continue;
    const number = await io.ask(`Choose one READY ${check.label.toLowerCase()} capability (Enter to skip): `);
    if (!number) continue;
    const choice = chosenReady(ranked, number);
    console.log(`Request a read-only review of ${artifact}. Supply only arguments allowed by the advertised capability.`);
    outcomes.push({ label: check.label, outcome: await invokeCapability(io, choice, check.label) });
  }
  console.log('\nRelease evidence — no simulated audit verdicts or automatic deployment.');
  for (const { label, outcome } of outcomes) showOutcome(label, outcome);
  if (!outcomes.length) console.log('No reviews ran. Do not treat this release as audited.');
} finally {
  io.close();
}
