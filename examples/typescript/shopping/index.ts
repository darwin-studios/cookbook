import {
  canRequestThread,
  choices,
  hasActCredential,
  search,
  sendThreadMessage,
  startThread,
} from '../../../lib/darwin.mjs';
import {
  hasProviderResult,
  isShoppingResearchCandidate,
  readThread,
  reviewPending,
  showConnectionDetails,
  showOutcome,
  terminal,
} from '../../../lib/recipe.mjs';

const io = terminal();
try {
  const item = await io.ask('What exact item are you looking for? ');
  if (!item) throw new Error('Enter an item to search for.');
  const constraints = await io.ask('Budget, condition, delivery, or other requirements: ');
  const query = `${item} ${constraints}`.trim();
  const objective = 'Find current product offers, not a checkout action';
  const found = await search(query, { context: [{ type: 'text', text: objective }], maxResults: 10 });
  let pool = choices(found);
  if (!pool.filter(isShoppingResearchCandidate).some(canRequestThread)) {
    console.log(
      'No available match for the exact item. Broadening agent discovery; the item and constraints remain unchanged.',
    );
    pool = [
      ...pool,
      ...choices(
        await search('product search', { context: [{ type: 'text', text: `${query}. ${objective}` }], maxResults: 10 }),
      ),
    ];
  }
  const byAgent = new Map<string, any>();
  for (const choice of pool) {
    if (!isShoppingResearchCandidate(choice)) continue;
    const previous = byAgent.get(choice.agent);
    if (!previous || (!canRequestThread(previous) && canRequestThread(choice))) byAgent.set(choice.agent, choice);
  }
  const results = [...byAgent.values()];
  showConnectionDetails(results);
  console.log(`\n${results.length} distinct product-search agents`);
  results.forEach((choice: any, index: number) =>
    console.log(
      `${index + 1}. ${choice.agentName} — ${choice.name} [${canRequestThread(choice) ? choice.readiness : choice.threadUnavailableReason || 'unavailable'}]`,
    ),
  );
  if (!results.some(canRequestThread)) console.log('No available product-search route. No offers were invented.');
  else if (!hasActCredential()) console.log('Search is complete. Run npm run act to compare real provider responses.');
  else {
    const numbers = [
      ...new Set(
        (await io.ask('Choose up to two available numbers, separated by commas: '))
          .split(',')
          .map((value: string) => Number(value.trim())),
      ),
    ].slice(0, 2);
    const selected = numbers.map((number: number) => results[number - 1]);
    if (!selected.length || selected.some((choice: any) => !canRequestThread(choice)))
      throw new Error('Choose available, distinct agents.');
    const outcomes = [];
    for (const choice of selected) {
      console.log(`\n${choice.agentName} / ${choice.name}\nKeep the request exact: ${query}`);
      console.log('Use the capability documentation linked in its connection prompt to review arguments.');
      const args = JSON.parse((await io.ask('Reviewed JSON arguments for this agent: ')) || '{}');
      if (!args || Array.isArray(args) || typeof args !== 'object') throw new Error('Arguments must be a JSON object.');
      if ((await io.ask(`Send ${JSON.stringify(args)} to this agent? Type yes: `)) !== 'yes') continue;
      const started = await startThread({ ...choice, query }, { messageType: 'action_request', messageContent: args });
      console.log(`Accepted on thread ${started.thread}; waiting for a result.`);
      let outcome = await readThread(started.thread, started.cursor, { requireResult: true });
      if (outcome.pending.some((request: any) => request.type === 'authentication_request'))
        outcome = await reviewPending(io, outcome);
      outcomes.push({ choice, outcome });
    }
    for (const [index, { choice, outcome }] of outcomes.entries()) {
      console.log(`Comparison ${index + 1}: ${choice.agentName}`);
      showOutcome(choice.agentName, outcome);
    }
    if (
      outcomes.length &&
      outcomes.every(({ outcome }) => hasProviderResult(outcome.messages) && !outcome.errors.length)
    ) {
      console.log('Compare the actual offer details above. This script never chooses an offer for you.');
      const next = Number(
        await io.ask('Continue with one agent? Enter its comparison number, or press Enter to stop: '),
      );
      if (Number.isInteger(next) && next >= 1 && next <= outcomes.length) {
        const picked = outcomes[next - 1];
        const message = await io.ask('What exact follow-up should that agent receive? ');
        if (
          message &&
          (await io.ask(`Send ${JSON.stringify(message)} to ${picked.choice.agentName}? Type yes: `)) === 'yes'
        ) {
          await sendThreadMessage({ thread: picked.outcome.thread }, picked.choice, {
            messageType: 'message',
            messageContent: message,
          });
          let continued = await readThread(picked.outcome.thread, picked.outcome.cursor, { requireResult: false });
          if (continued.pending.length) continued = await reviewPending(io, continued);
          showOutcome(picked.choice.agentName, continued);
        }
      }
    } else if (outcomes.length) {
      console.log('Comparison is incomplete; a missing provider result is not an offer.');
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  io.close();
}
