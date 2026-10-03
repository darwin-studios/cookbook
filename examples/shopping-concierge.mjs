import { chosenReady, discover, invokeCapability, showOutcome, terminal } from '../lib/recipe.mjs';

// Product idea: an intent-to-offer shopping layer inside an existing app.
// Discover providers at request time, request up to two live offers, and compare
// actual responses. This starter never places an order or approves payment.
const io = terminal();
try {
  console.log('Shopping concierge — compare live seller-agent responses, not static catalog cards.');
  const need = await io.ask('What are you shopping for? ');
  if (!need) process.exit(0);
  const constraints = await io.ask('Budget, delivery, condition, warranty, or other non-negotiables: ');
  const query = `Find a merchant or shopping agent that can find and quote: ${need}. Requirements: ${constraints}`;
  const ranked = await discover('Shopping agents', query, `Return a specific available option with total price, availability, delivery timing, and return terms for ${need}.`);
  if (!ranked.some((item) => item.canStartThread && item.readiness === 'ready')) process.exit(0);
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
  console.log('This starter does not call Pay or auto-confirm checkout. Review any later payment request separately.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  io.close();
}
