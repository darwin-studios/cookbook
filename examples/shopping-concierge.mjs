import { chosenReady, discover, invokeCapability, providerMessages, requireReady, showOutcome, terminal } from '../lib/recipe.mjs';

// Product idea: an intent-to-offer shopping layer inside an existing app.
// Discover providers at request time, request up to two live offers, and compare
// actual responses. This starter never places an order or approves payment.
const io = terminal();
try {
  console.log('Shopping concierge — compare live seller-agent responses, not static catalog cards.');
  const need = await io.ask('What are you shopping for? ');
  if (!need) process.exit(0);
  const constraints = await io.ask('Budget, delivery, condition, warranty, or other non-negotiables: ');
  // Keep discovery broad: product-specific constraints can suppress otherwise
  // relevant providers before we can inspect their live capabilities.
  const ranked = await discover('Shopping agents', 'shopping product search agent', 'Prefer quote-capable shopping agents');
  requireReady(ranked, 'shopping');
  const raw = await io.ask('Choose up to two READY capability numbers to request offers (comma-separated): ');
  const numbers = [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))].slice(0, 2);
  if (!numbers.length) process.exit(0);
  const selected = numbers.map((number) => chosenReady(ranked, number));
  if (new Set(selected.map((item) => item.agent)).size !== selected.length) throw new Error('Compare distinct seller agents, not two tools from the same agent.');
  if ((await io.ask('Confirm these are quote/search capabilities, not purchase or checkout actions. Type yes: ')) !== 'yes') {
    console.log('No requests sent.');
    process.exit(0);
  }
  const outcomes = [];
  for (const choice of selected) {
    console.log(`\nRequest an offer for: ${need}. Constraints: ${constraints}. Do not order or charge.`);
    outcomes.push({ choice, outcome: await invokeCapability(io, choice, 'Offer request') });
  }
  console.log('\nOffer comparison — only actual external responses appear below.');
  for (const { choice, outcome } of outcomes) showOutcome(choice.agentName, outcome);
  if (outcomes.some(({ outcome }) => !outcome || !providerMessages(outcome.messages).length)) {
    throw new Error('At least one selected seller has not returned an external response. Do not treat this comparison as complete.');
  }
  console.log('This starter does not call Pay or auto-confirm checkout. Review any later payment request separately.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  io.close();
}
