// Product idea: suggest useful agents inside an IDE without silently
// uploading a workspace or invoking tools. The user supplies a short task;
// editor language and coarse work area add context. Search runs in the
// background, but Act opens a separate, explicit OAuth-and-review flow.
//
// Try once: node examples/ide-companion.mjs --once "verify SPF and DMARC"
// Stream:   node examples/ide-companion.mjs --stream
import { createInterface } from 'node:readline';
import { run } from '../lib/flow.mjs';
import { search } from '../lib/darwin.mjs';
import { ideSearchRequest, ideSuggestions, normalizeIdeContext } from '../lib/ide-context.mjs';

const mode = process.argv[2] || '--stream';
const language = process.env.DARWIN_IDE_LANGUAGE || '';
const workArea = process.env.DARWIN_IDE_WORK_AREA || '';

if (mode === '--act') {
  await run({
    title: 'Proactive IDE companion — reviewed agent request',
    intro: 'Choose an eligible capability and explicitly approve its exact request. Nothing is sent by background discovery.',
    initialTask: process.env.DARWIN_IDE_TASK || '',
    query: (task) => ideSearchRequest({ task, language, workArea }).query,
    objective: (task) => ideSearchRequest({ task, language, workArea }).objective,
  });
} else if (mode === '--once') {
  try {
    const context = normalizeIdeContext({ task: process.argv[3], language, workArea });
    const request = ideSearchRequest(context);
    const found = await search(request.query, { objective: request.objective, numResults: 8 });
    const suggestions = ideSuggestions(found, context);
    console.log(JSON.stringify({ type: 'suggestions', ...context, outcome: found.outcome, suggestions,
      ...(suggestions.length ? {} : { message: 'No sufficiently relevant agent in these results. Refine the task; no Act request was sent.' }) }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
} else if (mode === '--stream') {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const emit = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
  let pending = null;
  let timer = null;
  let busy = false;
  let lastFingerprint = '';
  let lastSearchAt = 0;
  const debounceMs = 1200;
  const minIntervalMs = 30_000;

  async function flush() {
    timer = null;
    if (busy || !pending) return;
    const context = pending;
    pending = null;
    const fingerprint = JSON.stringify(context);
    if (fingerprint === lastFingerprint) {
      emit({ type: 'unchanged' });
      return;
    }
    const delay = minIntervalMs - (Date.now() - lastSearchAt);
    if (delay > 0) {
      pending = context;
      timer = setTimeout(flush, delay);
      return;
    }
    busy = true;
    lastFingerprint = fingerprint;
    lastSearchAt = Date.now();
    try {
      const request = ideSearchRequest(context);
      const found = await search(request.query, { objective: request.objective, numResults: 8 });
      const suggestions = ideSuggestions(found, context);
      emit({ type: 'suggestions', ...context, outcome: found.outcome, suggestions,
        ...(suggestions.length ? {} : { message: 'No sufficiently relevant agent in these results. Refine the task; no Act request was sent.' }) });
    } catch (error) {
      lastFingerprint = '';
      emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      busy = false;
      if (pending && !timer) timer = setTimeout(flush, debounceMs);
    }
  }

  input.on('line', (line) => {
    try {
      const context = normalizeIdeContext(JSON.parse(line));
      pending = context;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, debounceMs);
    } catch (error) {
      emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  });
  emit({ type: 'ready', message: 'Send one JSON context per line: {"task":"...","language":"typescript"}.' });
} else {
  console.error('Usage: node examples/ide-companion.mjs [--stream | --once "task" | --act]');
  process.exitCode = 2;
}
