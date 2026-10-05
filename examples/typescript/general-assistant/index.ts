import { canRequestThread, choices, hasActCredential, search, startThread } from '../../../lib/darwin.mjs';
import { hasProviderResult, readThread, reviewPending, showOutcome, terminal } from '../../../lib/recipe.mjs';

const io = terminal();
try {
  const task = process.env.DARWIN_INITIAL_TASK || await io.ask('What would you like to get done? ');
  if (!task) throw new Error('Enter a task to search for.');
  const found = await search(task, { objective: task, numResults: 5 });
  const results = choices(found);
  console.log(`\n${results.length} matching capabilities`);
  results.forEach((item: any, index: number) => {
    const available = canRequestThread(item) ? item.readiness : item.threadUnavailableReason || 'unavailable';
    console.log(`${index + 1}. ${item.agentName} — ${item.name} [${available}]`);
    console.log(`   ${item.description || 'No description'} · ${item.agent} / ${item.capability}`);
  });
  if (!results.some(canRequestThread)) {
    console.log('Nothing here can start a thread now. No agent was contacted.');
  } else if (!hasActCredential()) {
    console.log('Search is complete. Run npm run act for account OAuth and a reviewed request.');
  } else {
    const selected = results[Number(await io.ask('Choose an available number: ')) - 1];
    if (!canRequestThread(selected)) throw new Error('Choose a listed, available capability.');
    const mode = await io.ask('Ask a question [m] or run this capability [a]? ');
    if (!['m', 'a'].includes(mode)) throw new Error('No request sent.');
    const content = mode === 'm' ? task : JSON.parse(await io.ask('Arguments as JSON object ({} for none): ') || '{}');
    if (mode === 'a' && (!content || Array.isArray(content) || typeof content !== 'object')) throw new Error('Arguments must be a JSON object.');
    console.log(`\nTo: ${selected.agentName} / ${selected.name}\nRequest: ${JSON.stringify(content)}`);
    if ((await io.ask('Send this exact request? Type yes: ')) !== 'yes') throw new Error('No request sent.');
    const started = await startThread(selected, { messageType: mode === 'm' ? 'message' : 'action_request', messageContent: content });
    console.log(`Accepted on thread ${started.thread}; this is not a result.`);
    let outcome = await readThread(started.thread, started.cursor, { requireResult: mode === 'a' });
    if (outcome.pending.length) outcome = await reviewPending(io, outcome);
    showOutcome(selected.agentName, outcome);
    if (outcome.errors.length) process.exitCode = 1;
    if (mode === 'a' && !hasProviderResult(outcome.messages)) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally { io.close(); }
