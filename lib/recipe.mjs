import { createInterface } from 'node:readline/promises';
import { readFileSync } from 'node:fs';
import { choices, getThread, hasActCredential, search, startThread } from './darwin.mjs';

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

export function providerMessages(messages) {
  // Public get_thread returns only safe message/result projections. A Darwin-
  // relayed result may be a real tool outcome, but an accepted message is not.
  return (messages || []).filter((message) =>
    (message.from === 'agent' && ['message', 'result'].includes(message.type)) ||
    (message.from === 'darwin' && message.type === 'result'));
}

export function hasProviderResult(messages) {
  return providerMessages(messages).some((message) => message.type === 'result');
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
  const started = await startThread(choice, { messageType: 'action_request', messageContent: args });
  console.log(`Accepted request on thread ${started.thread}; waiting for a real response (acceptance is not completion).`);
  return await readThread(started.thread, started.cursor, { requireResult: true });
}

export async function readThread(threadId, initialCursor, { requireResult = false } = {}) {
  let cursor = initialCursor;
  let hasMore = false;
  const messages = [];
  let actions = [];
  let errors = [];
  let pending = [];
  for (let read = 0; read < 8; read++) {
    const state = await getThread(threadId, { cursor, wait: !hasMore });
    cursor = state.cursor;
    hasMore = Boolean(state.hasMore);
    messages.push(...(state.messages || []));
    actions = state.actions || [];
    errors = [
      ...actions.filter((action) => ['failed', 'cancelled', 'withdrawn'].includes(action.status))
        .map((action) => ({ code: `ACTION_${action.status.toUpperCase()}`, action: action.action })),
      ...messages.filter((message) => message.status === 'failed')
        .map((message) => ({ code: 'MESSAGE_FAILED', message: message.message })),
    ];
    pending = (state.requests || []).filter((request) =>
      request.status === 'pending' && ['approval_request', 'authentication_request', 'authentication_required', 'payment_request'].includes(request.type));
    if (pending.length) {
      console.log(`Thread ${threadId} needs review: ${pending.map((request) => `${request.type} ${request.request}`).join(', ')}`);
      break;
    }
    if (errors.length || (requireResult ? hasProviderResult(messages) : providerMessages(messages).length)) break;
  }
  return { thread: threadId, messages, actions, errors, pending };
}

export function showOutcome(label, outcome) {
  if (!outcome) return;
  const external = providerMessages(outcome.messages);
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
  for (const message of external) {
    console.log(message.content?.map((part) => part.text || `[${part.type}]`).join(' ') || '(empty content)');
    if (message.type === 'result' && message.data !== undefined) console.log(JSON.stringify(message.data, null, 2));
  }
  if (!hasProviderResult(outcome.messages)) console.log('No completed provider result yet; this action is not a successful demo.');
}
