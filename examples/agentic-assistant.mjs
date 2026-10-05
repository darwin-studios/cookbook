// A general assistant can discover an agent at request time instead of
// shipping a connector for every provider. Run Search alone with:
//   node examples/agentic-assistant.mjs
// To authorize an actual request, use:
//   node scripts/run-with-oauth.mjs agentic-assistant
//
// This is a terminal product prototype. A real app would put these steps in
// its own UI and keep the OAuth token on its server.
import {
  canRequestThread, choices, hasActCredential, search, startThread,
} from '../lib/darwin.mjs';
import { hasProviderResult, providerMessages, readThread, terminal } from '../lib/recipe.mjs';

function showCandidate(candidate, index) {
  const description = candidate.description?.replace(/\s+/g, ' ').slice(0, 200) || 'No description';
  const status = candidate.readiness === 'ready' && candidate.canStartThread
    ? 'READY'
    : candidate.readiness === 'recheck_available' && candidate.canAttemptThread
      ? 'RECHECK REQUIRED'
      : 'UNAVAILABLE';
  console.log(`${index + 1}. ${candidate.agentName} / ${candidate.name} [${status}]`);
  console.log(`   ${description}`);
  console.log(`   Agent ID: ${candidate.agent} · Capability ID: ${candidate.capability}`);
  if (candidate.threadUnavailableReason && status === 'UNAVAILABLE') {
    console.log(`   Cannot Act: ${candidate.threadUnavailableReason}`);
  }
  if (candidate.input?.available) {
    const fields = candidate.input.fields.map((field) =>
      `${field.name}${field.required ? '*' : ''} (${field.valueType})`);
    console.log(`   Inputs: ${fields.join(', ') || 'none'}`);
  }
}

function showOutcome(outcome) {
  for (const message of providerMessages(outcome.messages)) {
    const text = message.content?.map((part) => part.text || `[${part.type}]`).join(' ') || '';
    console.log(`Provider: ${text}`);
    if (message.type === 'result' && message.data !== undefined) {
      console.log(JSON.stringify(message.data, null, 2));
    }
  }
  for (const request of outcome.pending) {
    console.log(`Needs separate review: ${request.type} ${request.request}`);
  }
  if (outcome.errors.length) {
    throw new Error(`Thread ${outcome.thread} failed: ${outcome.errors.map((error) => error.code).join(', ')}. Inspect this thread before any retry.`);
  }
}

const io = terminal();
try {
  // 1. Your assistant already has a user task. Ask Browse Search for matching
  // capabilities. Search does not contact the external provider.
  const task = await io.ask('What would you like to get done? ');
  if (task) {
    const found = await search(task, {
      objective: `Find an agent able to complete this exact task: ${task}`,
      numResults: 8,
    });
    const ranked = choices(found);
    console.log(`\nSearch outcome: ${found.outcome || 'unknown'}; ${ranked.length} ranked capabilities`);
    ranked.forEach(showCandidate);

    // A result can be useful for discovery even when its route cannot execute.
    // Only an explicitly ready or first-use-recheckable result may proceed.
    const eligible = ranked.filter(canRequestThread);
    if (!ranked.length) {
      console.log('No matching capability. Refine the task; no Act request was sent.');
    } else if (!eligible.length) {
      console.log('No executable route in these results. Discovery succeeded, but no provider was contacted.');
    } else if (!hasActCredential()) {
      console.log('\nSearch is complete. To try Act, run: node scripts/run-with-oauth.mjs agentic-assistant');
      console.log('An application Search key cannot authorize a request for a person.');
    } else {
      // 2. The user chooses the exact Search result. Never invent an ID from a
      // display name or silently switch providers after the user approves one.
      const number = Number(await io.ask('Choose an eligible number (Enter to stop): '));
      if (Number.isInteger(number) && number >= 1 && number <= ranked.length) {
        const selected = ranked[number - 1];
        if (!canRequestThread(selected)) throw new Error('That capability is not eligible for Act now.');

        const mode = (await io.ask('Ask a question [m] or request this capability [a]? ')).toLowerCase();
        let messageType;
        let messageContent;
        if (mode === 'm') {
          messageType = 'message';
          messageContent = task;
        } else if (mode === 'a') {
          messageType = 'action_request';
          const raw = await io.ask('Capability arguments as JSON object ({} if none): ');
          try { messageContent = JSON.parse(raw || '{}'); }
          catch { throw new Error('Arguments must be valid JSON.'); }
          if (!messageContent || Array.isArray(messageContent) || typeof messageContent !== 'object') {
            throw new Error('Arguments must be a JSON object.');
          }
        } else {
          console.log('No request sent.');
        }

        if (messageType) {
          // 3. Review the provider, capability, and arguments before the only
          // mutation in this recipe. Auth, approval, and payment remain separate.
          console.log(`\nTarget: ${selected.agentName} / ${selected.name}`);
          console.log(`Request: ${messageType} ${JSON.stringify(messageContent)}`);
          if (selected.readiness === 'recheck_available') {
            console.log('Darwin must verify this route at first use; verification may still fail.');
          }
          if ((await io.ask('Send this exact request? Type yes: ')) === 'yes') {
            // POST /api/v2/act/threads atomically records the first typed
            // message. Its accepted status is not a completed provider result.
            const started = await startThread(selected, { messageType, messageContent });
            console.log(`Accepted on thread ${started.thread}. Waiting for the actual provider response…`);

            // GET the same thread with its cursor. Never auto-retry a start
            // whose outcome is uncertain; inspect the thread first.
            const outcome = await readThread(started.thread, started.cursor, {
              requireResult: messageType === 'action_request',
            });
            showOutcome(outcome);
            const complete = messageType === 'action_request'
              ? hasProviderResult(outcome.messages)
              : providerMessages(outcome.messages).length > 0;
            if (!complete) {
              throw new Error(`Thread ${started.thread} has no completed provider response yet. Acceptance is not completion.`);
            }
          } else {
            console.log('No Act request sent.');
          }
        }
      } else {
        console.log('No Act request sent.');
      }
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  io.close();
}
