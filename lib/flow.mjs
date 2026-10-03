import { createInterface } from 'node:readline/promises';
import { choices, getThread, hasActCredential, search, startThread } from './darwin.mjs';

export async function run({ title, query, objective, intro }) {
  const io = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (prompt) => {
    try { return await io.question(prompt); }
    catch (error) {
      if (error?.code === 'ERR_USE_AFTER_CLOSE') return '';
      throw error;
    }
  };
  try {
    console.log(`\n${title}\n${intro}\n`);
    const task = (await ask('What do you need? ')).trim();
    if (!task) return;
    const found = await search(query(task), { objective: objective(task), numResults: 8 });
    const ranked = choices(found);
    if (!ranked.length) {
      console.log(`No matching capability (${found.outcome}). Try a more specific request.`);
      return;
    }
    ranked.forEach((item, index) => {
      const description = item.description?.replace(/\s+/g, ' ').slice(0, 240) || 'No description';
      console.log(`${index + 1}. ${item.agentName} — ${item.name}\n   ${description}${item.description?.length > 240 ? '…' : ''}\n   ${item.readiness}${item.canStartThread ? ' · can start thread' : ''}`);
    });
    console.log('\nSearch is read-only. Review the actual agent and capability before continuing.');
    const selected = Number(await ask('Select a number (Enter to stop): '));
    if (!selected || !ranked[selected - 1]) return;
    const choice = ranked[selected - 1];
    if (!choice.canStartThread || choice.readiness !== 'ready') {
      console.log('This result is discoverable but not executable now. No thread was started.');
      return;
    }
    if (!hasActCredential()) {
      console.log('To run Act, set a user-scoped Darwin credential on the server. No thread was started.');
      return;
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
    const started = await startThread(choice, { messageType, messageContent, agent: process.env.DARWIN_AGENT_ID });
    console.log(`Thread ${started.thread} accepted. Accepted is not delivery or completion.`);
    let cursor = started.cursor;
    let stateHasMore = false;
    for (let read = 0; read < 8; read++) {
      const state = await getThread(started.thread, { cursor, wait: read > 0 && !stateHasMore, agent: process.env.DARWIN_AGENT_ID });
      cursor = state.cursor;
      stateHasMore = Boolean(state.hasMore);
      for (const message of state.messages || []) {
        console.log(`${message.from}: ${message.content?.map((part) => part.text || `[${part.type}]`).join(' ') || ''}`);
        if (message.type === 'result' && message.data !== undefined) console.log(JSON.stringify(message.data, null, 2));
      }
      for (const request of state.requests || []) if (request.status === 'pending') console.log(`Needs review: ${request.type} ${request.request}. Use Darwin's hosted Authenticate/Pay/approval flow; do not paste secrets here.`);
      if (state.needsAttention || (state.messages || []).some((m) => m.from !== 'you')) break;
    }
  } finally {
    io.close();
  }
}
