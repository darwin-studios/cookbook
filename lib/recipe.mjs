import { createInterface } from 'node:readline/promises';
import { readFileSync } from 'node:fs';
import { choices, getThread, hasActCredential, search, sendThreadMessage, startThread } from './darwin.mjs';

export function terminal() {
  if (!process.stdin.isTTY) {
    const answers = readFileSync(0, 'utf8').split(/\r?\n/);
    return {
      close: () => {},
      async ask(label) {
        process.stdout.write(label);
        const answer = (answers.shift() || '').trim();
        process.stdout.write('\n');
        return answer;
      },
    };
  }
  const io = createInterface({ input: process.stdin, output: process.stdout });
  return {
    close: () => io.close(),
    async ask(label) {
      try { return (await io.question(label)).trim(); }
      catch (error) {
        if (error?.code === 'ERR_USE_AFTER_CLOSE') return '';
        throw error;
      }
    },
  };
}

export async function discover(label, query, objective, { select = () => true, category } = {}) {
  const found = await search(query, { objective, category, numResults: 10 });
  const ranked = choices(found).filter(select);
  console.log(`\n${label}: ${found.outcome}; ${ranked.length} ranked ${ranked.length === 1 ? 'capability' : 'capabilities'}`);
  ranked.forEach((item, index) => {
    const description = item.description?.replace(/\s+/g, ' ').slice(0, 170) || 'No description';
    console.log(`${index + 1}. ${item.agentName} / ${item.name} [${item.readiness}]${item.canStartThread ? ' READY' : ''}`);
    console.log(`   ${description}${item.description?.length > 170 ? '…' : ''}`);
    if (!item.canStartThread && item.threadUnavailableReason) console.log(`   Cannot Act: ${item.threadUnavailableReason}`);
    if (item.input?.available) {
      console.log(`   Inputs: ${item.input.fields.map((field) => `${field.name}${field.required ? '*' : ''} (${field.valueType})`).join(', ') || 'none'}`);
    }
  });
  if (!ranked.some((item) => item.canStartThread && item.readiness === 'ready')) {
    console.log('No executable match. This recipe will not simulate a provider response or silently use another API.');
  }
  return ranked;
}

export function chosenReady(ranked, number) {
  const item = ranked[Number(number) - 1];
  if (!item) throw new Error('Choose a listed number.');
  if (!item.canStartThread || item.readiness !== 'ready') throw new Error('That listing is discoverable but not executable now.');
  return item;
}

export function requireReady(ranked, label = 'this recipe') {
  if (!ranked.some((item) => item.canStartThread && item.readiness === 'ready')) {
    throw new Error(`No executable match for ${label}. Search discovery succeeded, but the live Act demo cannot run.`);
  }
}

export function isDistinctAgent(previous, candidate) {
  return !previous.some((item) => item.agent === candidate.agent);
}

export function isShoppingResearchCandidate(item) {
  const text = `${item.name || ''} ${item.description || ''}`;
  return /product.search|shopping search|shopping results|google shopping|price comparison|product discovery|\bquote\b/i.test(text)
    && !/\b(purchase|checkout|place an order|shopping guide)\b/i.test(text);
}

export function providerMessages(events) {
  // Darwin may relay a verified tool outcome as a runtime-authored result.
  // Delivery/status events are not provider answers, but a result is an
  // operation outcome even when its sender is the runtime.
  return (events || []).filter((event) =>
    (event.sender === 'target_ai' && ['message', 'result'].includes(event.payload?.type)) ||
    (event.sender === 'runtime' && event.payload?.type === 'result'));
}

export function hasProviderResult(events) {
  return providerMessages(events).some((event) => event.payload.type === 'result');
}

export async function invokeCapability(io, choice, label) {
  if (!hasActCredential()) {
    throw new Error('Act needs DARWIN_ACCESS_TOKEN: a user-scoped OAuth grant. An application API key cannot Act.');
  }
  const raw = await io.ask(`${label} arguments as JSON object ({} for none): `);
  let args;
  try { args = JSON.parse(raw || '{}'); }
  catch { throw new Error('Arguments must be valid JSON.'); }
  if (!args || Array.isArray(args) || typeof args !== 'object') throw new Error('Arguments must be a JSON object.');
  console.log(`\nProvider: ${choice.agentName}\nCapability: ${choice.name}\nArguments: ${JSON.stringify(args)}`);
  if ((await io.ask('Send this exact request to the external agent? Type yes: ')) !== 'yes') return null;
  const started = await startThread(choice);
  console.log(`Started thread ${started.threadId}; no action has been sent yet.`);
  const accepted = await sendThreadMessage(started, choice, { messageType: 'action_request', messageContent: args });
  console.log(`Accepted request on thread ${started.threadId}; waiting for a real response (acceptance is not completion).`);
  return await readThread(started.threadId, accepted.cursor, { requireResult: true });
}

export async function readThread(threadId, initialCursor, { requireResult = false } = {}) {
  let cursor = initialCursor;
  let hasMore = false;
  const events = [];
  const errors = [];
  let pending = [];
  for (let read = 0; read < 8; read++) {
    const state = await getThread(threadId, { afterCursor: cursor, wait: !hasMore });
    cursor = state.cursor;
    hasMore = Boolean(state.hasMore);
    events.push(...(state.events || []));
    errors.push(...(state.errors || []));
    errors.push(...(state.events || []).filter((event) => event.payload?.type === 'error').map((event) => event.payload));
    pending = Object.values(state.requests || {}).filter((request) =>
      !request.resolvedBy && ['approval_request', 'authentication_request', 'payment_request'].includes(request.kind));
    if (pending.length) {
      console.log(`Thread ${threadId} needs review: ${pending.map((request) => `${request.kind} ${request.id}`).join(', ')}`);
      break;
    }
    if (errors.length || (requireResult ? hasProviderResult(events) : providerMessages(events).length)) break;
  }
  return { thread: threadId, events, errors, pending };
}

export function showOutcome(label, outcome) {
  if (!outcome) return;
  const external = providerMessages(outcome.events);
  console.log(`\n${label} — thread ${outcome.thread}`);
  for (const error of outcome.errors || []) {
    console.log(`Provider/runtime error ${error.code}${error.retryable ? ' (recheck before retrying)' : ''}`);
  }
  if (!external.length) {
    console.log(outcome.errors?.length
      ? 'No successful external response. Review the thread and do not replay an effect automatically.'
      : 'No external response yet. Resume this thread later; do not claim success.');
    return;
  }
  for (const event of external) {
    console.log(event.payload.parts?.map((part) => part.text || `[${part.type}]`).join(' ') || '(empty content)');
    if (event.payload.type === 'result' && event.payload.data !== undefined) console.log(JSON.stringify(event.payload.data, null, 2));
  }
  if (!hasProviderResult(outcome.events)) console.log('No completed provider result yet; this action is not a successful demo.');
}
