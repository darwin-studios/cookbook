// Product idea: add live specialist product research to a shopping app.
// The app keeps the customer's exact need, discovers providers dynamically,
// asks up to two of them for results, and displays only their real responses.
// This recipe never places an order, approves a charge, or invents a price.
import {
  canRequestThread, choices, hasActCredential, search, startThread,
} from '../lib/darwin.mjs';
import {
  hasProviderResult, isShoppingResearchCandidate, readThread, showOutcome, terminal,
} from '../lib/recipe.mjs';

const objective = 'Find product-search or price-comparison capabilities, not purchase or checkout';

function uniqueCandidates(results) {
  const seen = new Set();
  return results.filter((item) => {
    if (!isShoppingResearchCandidate(item)) return false;
    const key = `${item.agent}:${item.capability}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function showCandidates(candidates) {
  candidates.forEach((item, index) => {
    const route = item.readiness === 'ready' && item.canStartThread
      ? 'READY'
      : item.readiness === 'recheck_available' && item.canAttemptThread
        ? 'RECHECK REQUIRED'
        : 'UNAVAILABLE';
    console.log(`${index + 1}. ${item.agentName} / ${item.name} [${route}]`);
    console.log(`   ${item.description?.replace(/\s+/g, ' ').slice(0, 180) || 'No description'}`);
    console.log(`   Agent ID: ${item.agent} · Capability ID: ${item.capability}`);
    if (item.input?.available) {
      console.log(`   Inputs: ${item.input.fields.map((field) =>
        `${field.name}${field.required ? '*' : ''} (${field.valueType})`).join(', ') || 'none'}`);
    }
    if (route === 'UNAVAILABLE' && item.threadUnavailableReason) {
      console.log(`   Cannot Act: ${item.threadUnavailableReason}`);
    }
  });
}

const io = terminal();
try {
  console.log('Shopping concierge — compare actual provider responses, not catalog placeholders.\n');
  const need = await io.ask('What exact product or need are you shopping for? ');
  if (need) {
    const constraints = await io.ask('Budget, condition, delivery, warranty, or other constraints: ');

    // 1. Search for an agent that can research this exact request. If none is
    // currently executable, broaden AGENT discovery only. Never replace the
    // item or constraints in the eventual provider request.
    const exact = await search(need, { category: 'shopping', objective, numResults: 10 });
    let candidates = uniqueCandidates(choices(exact));
    if (!candidates.some(canRequestThread)) {
      console.log('No eligible specialist from exact discovery; trying broader agent discovery.');
      const broader = await search('product search', { category: 'shopping', objective, numResults: 10 });
      candidates = uniqueCandidates([...candidates, ...choices(broader)]);
    }
    console.log(`\n${candidates.length} product-research capabilities found:`);
    showCandidates(candidates);

    if (!candidates.some(canRequestThread)) {
      console.log('No eligible route to compare now. Search worked, but no provider was contacted.');
    } else if (!hasActCredential()) {
      console.log('\nTo ask providers, run: node scripts/run-with-oauth.mjs shopping-concierge');
      console.log('A Search key cannot authorize requests or a purchase on behalf of a person.');
    } else {
      // 2. The person chooses up to two distinct agents, not two tools from
      // one agent. They must review each capability's effect and input schema.
      const raw = await io.ask('Choose up to two eligible numbers (comma-separated; Enter to stop): ');
      const numbers = [...new Set(raw.split(',').map((value) => Number(value.trim()))
        .filter((number) => Number.isInteger(number) && number > 0))].slice(0, 2);
      const selected = numbers.map((number) => {
        const item = candidates[number - 1];
        if (!item || !canRequestThread(item)) throw new Error('Choose listed, eligible capabilities only.');
        return item;
      });
      if (new Set(selected.map((item) => item.agent)).size !== selected.length) {
        throw new Error('Choose distinct agents, not two tools from the same agent.');
      }
      if (selected.length && (await io.ask('Confirm these are search/quote capabilities, not purchase or checkout actions. Type yes: ')) === 'yes') {
        const outcomes = [];
        for (const provider of selected) {
          // Providers have different input schemas, so the developer supplies
          // reviewed JSON matching the advertised fields. Do not guess or
          // send personal/payment details. The exact need must remain intact.
          console.log(`\n${provider.agentName} / ${provider.name}`);
          console.log(`Keep this request intact: ${need}. Constraints: ${constraints || 'none'}.`);
          const rawArguments = await io.ask('JSON arguments for this capability ({} if none): ');
          let args;
          try { args = JSON.parse(rawArguments || '{}'); }
          catch { throw new Error('Arguments must be valid JSON.'); }
          if (!args || Array.isArray(args) || typeof args !== 'object') {
            throw new Error('Arguments must be a JSON object.');
          }
          console.log(`Review ${provider.agentName} / ${provider.name}: ${JSON.stringify(args)}`);
          if (provider.readiness === 'recheck_available') {
            console.log('Darwin must verify this exact route at first use; it may still fail.');
          }
          if ((await io.ask('Send this exact product-research request? Type yes: ')) !== 'yes') {
            console.log('Skipped; no request sent to this provider.');
            continue;
          }

          // 3. Start one thread per provider with a typed action request.
          // An accepted thread is not an offer or a completed comparison.
          const started = await startThread(provider, {
            messageType: 'action_request', messageContent: args,
          });
          console.log(`Accepted on thread ${started.thread}; waiting for an external result…`);
          const outcome = await readThread(started.thread, started.cursor, { requireResult: true });
          outcomes.push({ provider, outcome });
        }

        // 4. Compare only external responses. If a provider fails or asks
        // for additional approval, leave the comparison visibly incomplete.
        if (outcomes.length) console.log('\nProvider responses');
        for (const { provider, outcome } of outcomes) {
          showOutcome(provider.agentName, outcome);
        }
        if (outcomes.some(({ outcome }) => outcome.errors.length || !hasProviderResult(outcome.messages))) {
          throw new Error('At least one provider did not return a completed result. Do not present this as a finished comparison.');
        }
        if (outcomes.length) {
          console.log('\nCompare the returned product details and links above. This recipe never calls Pay or confirms checkout.');
        }
      } else {
        console.log('No provider requests sent.');
      }
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  io.close();
}
