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

export function providerMessages(messages) {
  // Darwin may relay a verified tool outcome as a runtime-authored result.
  // Delivery/status events are not provider answers, but a result is an
  // operation outcome even when its sender is the runtime.
  return (messages || []).filter((message) => message.from === 'agent' || message.type === 'result');
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
  const started = await startThread(choice, {
    messageType: 'action_request', messageContent: args,
  });
  console.log(`Accepted thread ${started.thread}; waiting for a real response (acceptance is not completion).`);
  return await readThread(started);
}

export async function readThread(started) {
  let cursor = started.cursor;
  let hasMore = false;
  const messages = [];
  for (let read = 0; read < 8; read++) {
    const state = await getThread(started.thread, { cursor, wait: read > 0 && !hasMore });
    cursor = state.cursor;
    hasMore = Boolean(state.hasMore);
    messages.push(...(state.messages || []));
    const pending = (state.requests || []).filter((request) => request.status === 'pending');
    if (pending.length) {
      console.log(`Thread ${started.thread} needs review: ${pending.map((request) => `${request.type} ${request.request}`).join(', ')}`);
      break;
    }
    if (state.needsAttention || providerMessages(messages).length) break;
  }
  return { thread: started.thread, messages };
}

export function showOutcome(label, outcome) {
  if (!outcome) return;
  const external = providerMessages(outcome.messages);
  console.log(`\n${label} — thread ${outcome.thread}`);
  if (!external.length) {
    console.log('No external response yet. Resume this thread later; do not claim success.');
    return;
  }
  for (const message of external) {
    console.log(message.content?.map((part) => part.text || `[${part.type}]`).join(' ') || '(empty content)');
    if (message.type === 'result' && message.data !== undefined) console.log(JSON.stringify(message.data, null, 2));
  }
}
