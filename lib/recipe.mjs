import { createInterface } from 'node:readline/promises';
import { readFileSync } from 'node:fs';
import { canRequestThread, choices, getThread, hasActCredential, search, startThread } from './darwin.mjs';

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

export async function findCandidates(query, objective, { select = () => true, category, fallbackQuery } = {}) {
  const found = await search(query, { objective, category, numResults: 10 });
  if (!Array.isArray(found.agents) || !Array.isArray(found.results)) throw new Error('Invalid Search response shape');
  let ranked = choices(found).filter(select);
  let outcome = found.outcome;
  let broadened = false;
  if (fallbackQuery && !ranked.some(canRequestThread)) {
    broadened = true;
    const broader = await search(fallbackQuery, { objective, category, numResults: 10 });
    if (!Array.isArray(broader.agents) || !Array.isArray(broader.results)) throw new Error('Invalid broader Search response shape');
    const seen = new Set(ranked.map((item) => `${item.agent}:${item.capability}`));
    ranked = [...ranked, ...choices(broader).filter((item) => {
      if (!select(item)) return false;
      const key = `${item.agent}:${item.capability}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })];
    outcome = `${found.outcome}; broader search ${broader.outcome}`;
  }
  return { ranked, outcome, broadened };
}

export async function discover(label, query, objective, { select = () => true, category, fallbackQuery } = {}) {
  const { ranked, outcome, broadened } = await findCandidates(query, objective, { select, category, fallbackQuery });
  if (broadened) console.log(`No ready or first-use-recheckable match for the exact request. Broadened agent discovery to "${fallbackQuery}"; the original request stays unchanged for any provider call.`);
  console.log(`\n${label}: ${outcome}; ${ranked.length} ranked ${ranked.length === 1 ? 'capability' : 'capabilities'}`);
  ranked.forEach((item, index) => {
    const description = item.description?.replace(/\s+/g, ' ').slice(0, 170) || 'No description';
    const routeLabel = item.canStartThread && item.readiness === 'ready'
      ? ' READY'
      : item.canAttemptThread && item.readiness === 'recheck_available' ? ' RECHECK BEFORE EXECUTION' : '';
    console.log(`${index + 1}. ${item.agentName} / ${item.name} [${item.readiness}]${routeLabel}`);
    console.log(`   ${description}${item.description?.length > 170 ? '…' : ''}`);
    if (!canRequestThread(item) && item.threadUnavailableReason) console.log(`   Cannot Act: ${item.threadUnavailableReason}`);
    if (item.readiness === 'recheck_available' && item.canAttemptThread) {
      console.log('   Darwin may verify this exact route at first use. It can still fail; no provider result is promised.');
    }
    if (item.input?.available) {
      console.log(`   Inputs: ${item.input.fields.map((field) => `${field.name}${field.required ? '*' : ''} (${field.valueType})`).join(', ') || 'none'}`);
    }
  });
  if (!ranked.some(canRequestThread)) {
    console.log('No ready or first-use-recheckable match. This recipe will not simulate a provider response or silently use another API.');
  }
  return ranked;
}

export function chosenReady(ranked, number) {
  const item = ranked[Number(number) - 1];
  if (!item) throw new Error('Choose a listed number.');
  if (!canRequestThread(item)) throw new Error('That listing is discoverable but not eligible for a ready or first-use-rechecked Act request now.');
  return item;
}

export function requireReady(ranked, label = 'this recipe') {
  if (!ranked.some(canRequestThread)) {
    throw new Error(`No ready or first-use-recheckable match for ${label}. Search discovery succeeded, but the live Act demo cannot run.`);
  }
}

export function isShoppingResearchCandidate(item) {
  const name = item.name || '';
  const description = item.description || '';
  const text = `${name} ${description}`;
  return /product.search|shopping search|shopping results|google shopping|price comparison|product discovery|\bquote\b/i.test(text)
    // A read-only listing may report a "purchase signal" metric or return a
    // checkout URL. Exclude operations that perform a purchase or checkout.
    && !/\b(purchase|checkout|place[_ -]?(?:an?[_ -]?)?order|buy[_ -]?product|shopping guide)\b/i.test(name)
    && !/\b(?:place|places|submit|submits|complete|completes|initiate|initiates|process|processes) (?:an? )?(?:order|checkout|purchase)\b|\b(?:buy|buys|purchase|purchases) products?\b|\bcharge(?:s)? (?:a|the) (?:card|customer)\b/i.test(description);
}

export function isAccessibilityAuditCandidate(item) {
  const name = item.name || '';
  const text = `${name} ${item.description || ''}`;
  return /accessib|wcag|\ba11y\b/i.test(text)
    && /scan|audit|check|test|violation|analy[sz]/i.test(text)
    && /web(?:site|page)?|\bsite\b|\bpage\b|\burl\b|\bhtml\b/i.test(text)
    && !/\b(?:brand colou?r|palette)\b/i.test(name)
    && !/\b(offering|pricing band|consulting package|book a demo|sales quote)\b/i.test(text);
}

export function providerMessages(messages) {
  // Public get_thread projects only safe message/result records. An accepted
  // mutation or an action still awaiting confirmation is not a provider answer.
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
  if (choice.readiness === 'recheck_available') {
    console.log('This route must pass Darwin’s live first-use verification before your request can execute. Verification failure is not a provider response.');
  }
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
    pending = (state.requests || []).filter((request) => request.status === 'pending');
    if (pending.length) {
      console.log(`Thread ${threadId} needs review: ${pending.map((request) => `${request.type} ${request.request}`).join(', ')}. No confirmation was sent.`);
      break;
    }
    if (errors.length || (requireResult ? hasProviderResult(messages) : providerMessages(messages).length)) break;
  }
  return { thread: threadId, cursor, messages, actions, errors, pending };
}

// A pending request is a new decision, not permission inherited from the
// original thread. This helper never chooses an account or payment method.
export async function reviewPending(io, outcome) {
  const pending = outcome.pending?.[0];
  if (!pending) return outcome;
  console.log(`\n${pending.type} request ${pending.request}`);
  console.log(JSON.stringify(pending, null, 2));
  if (!['authentication_request', 'payment_request'].includes(pending.type)) {
    console.log('This request needs review in Darwin. No confirmation was sent.');
    return outcome;
  }
  if ((await io.ask('Open this exact hosted review flow? Type yes: ')) !== 'yes') return outcome;
  const { request } = await import('./darwin.mjs');
  const path = pending.type === 'authentication_request' ? '/act/authentications' : '/act/payments';
  const body = { request: pending.request, idempotencyKey: crypto.randomUUID() };
  const started = await request(path, { method: 'POST', body });
  const url = started.url || started.authorizationUrl || started.paymentUrl;
  if (url) console.log(`Complete the review on Darwin: ${url}`);
  console.log(`Status: ${started.status || 'pending'}. A redirect is not a completed action or receipt.`);
  if (['denied', 'failed', 'expired', 'uncertain'].includes(started.status)) return outcome;
  if (started.status === 'settled' && !started.receipt) return outcome;
  if (!url && !['connected', 'settled'].includes(started.status)) return outcome;
  if (url && (await io.ask('After completing the hosted flow, press Enter to read this thread (or type stop): ')) === 'stop') return outcome;
  const resumed = await readThread(outcome.thread, outcome.cursor, { requireResult: true });
  if (resumed.pending.length) console.log('Still pending. Resume this thread later; do not start another payment.');
  return resumed;
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
