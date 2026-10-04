import { choices, hasActCredential, search, sendThreadMessage, startThread } from './darwin.mjs';
import { hasProviderResult, providerMessages, readThread, terminal } from './recipe.mjs';

export async function run({ title, query, objective, intro }) {
  const io = terminal();
  const ask = io.ask;
  try {
    console.log(`\n${title}\n${intro}\n`);
    const task = (await ask('What do you need? ')).trim();
    if (!task) return;
    const found = await search(query(task), { objective: objective(task), numResults: 8 });
    const ranked = choices(found);
    if (!ranked.length) {
      throw new Error(`No matching capability (${found.outcome}). Try a more specific request.`);
    }
    ranked.forEach((item, index) => {
      const description = item.description?.replace(/\s+/g, ' ').slice(0, 240) || 'No description';
      console.log(`${index + 1}. ${item.agentName} — ${item.name}\n   ${description}${item.description?.length > 240 ? '…' : ''}\n   ${item.readiness}${item.canStartThread ? ' · can start thread' : ''}`);
      if (item.input?.available) {
        console.log(`   Inputs: ${item.input.fields.map((field) => `${field.name}${field.required ? '*' : ''} (${field.valueType})`).join(', ') || 'none'}`);
      }
    });
    if (!ranked.some((item) => item.canStartThread && item.readiness === 'ready')) {
      throw new Error('Search found capabilities, but none can start a thread now. No Act request was sent.');
    }
    console.log('\nSearch is read-only. Review the actual agent and capability before continuing.');
    const selected = Number(await ask('Select a number (Enter to stop): '));
    if (!selected || !ranked[selected - 1]) return;
    const choice = ranked[selected - 1];
    if (!choice.canStartThread || choice.readiness !== 'ready') {
      throw new Error('This result is discoverable but not executable now. No thread was started.');
    }
    if (!hasActCredential()) {
      throw new Error('To run Act, set a user-scoped Darwin OAuth token on the server. Application API keys are Search-only. No thread was started.');
    }
    const mode = (await ask('Send a question [m] or request this capability [a]? ')).trim().toLowerCase();
    let messageType, messageContent;
    if (mode === 'm') {
      messageType = 'message';
      messageContent = task;
    } else if (mode === 'a') {
      messageType = 'action_request';
      const input = (await ask('Capability arguments as JSON object ({} if none): ')).trim() || '{}';
      try { messageContent = JSON.parse(input); } catch { throw new Error('Arguments must be valid JSON'); }
      if (!messageContent || Array.isArray(messageContent) || typeof messageContent !== 'object') throw new Error('Arguments must be a JSON object');
      console.log(`Requesting ${choice.agentName} / ${choice.name} with ${JSON.stringify(messageContent)}`);
    } else return;
    if ((await ask('Send to the external agent? Type yes: ')).trim() !== 'yes') return;
    const started = await startThread(choice);
    console.log(`Thread ${started.threadId} started; no message has been sent yet.`);
    const accepted = await sendThreadMessage(started, choice, { messageType, messageContent });
    console.log(`Message accepted on thread ${started.threadId}. Acceptance is not delivery or completion.`);
    const outcome = await readThread(started.threadId, accepted.cursor, { requireResult: messageType === 'action_request' });
    for (const event of providerMessages(outcome.events)) {
      console.log(`${event.sender}: ${event.payload.parts?.map((part) => part.text || `[${part.type}]`).join(' ') || ''}`);
      if (event.payload.type === 'result' && event.payload.data !== undefined) console.log(JSON.stringify(event.payload.data, null, 2));
    }
    for (const request of outcome.pending) console.log(`Needs review: ${request.kind} ${request.id}. Use Darwin's separate hosted authorization flow; do not paste secrets here.`);
    if (outcome.errors.length) throw new Error(`Thread ${started.threadId} failed: ${outcome.errors.map((error) => error.code).join(', ')}. Review the thread; do not replay an effect automatically.`);
    if (messageType === 'action_request' ? !hasProviderResult(outcome.events) : !providerMessages(outcome.events).length) {
      throw new Error(`Thread ${started.threadId} has no completed provider result yet. Acceptance is not completion.`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    io.close();
  }
}
