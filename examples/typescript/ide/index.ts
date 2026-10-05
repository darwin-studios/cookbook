import { createInterface } from 'node:readline';
import { search } from '../../../lib/darwin.mjs';
import { ideSearchRequest, ideSuggestions, normalizeIdeContext } from '../../../lib/ide-context.mjs';

// The editor sends only a user-approved task summary and coarse language.
// Results are suggestions; this background worker never invokes Act.
const once = process.argv[2] === '--once';
let last = '';
let lastAt = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: any;
const emit = (value: unknown) => console.log(JSON.stringify(value));
async function suggest(input: unknown) {
  const context = normalizeIdeContext(input);
  const key = JSON.stringify(context);
  if (key === last) return emit({ type: 'unchanged' });
  last = key;
  lastAt = Date.now();
  try {
    const request = ideSearchRequest(context);
    const found = await search(request.query, { objective: request.objective, numResults: 8 });
    emit({ type: 'suggestions', ...context, outcome: found.outcome, suggestions: ideSuggestions(found, context) });
  } catch (error) { last = ''; emit({ type: 'error', message: error instanceof Error ? error.message : String(error) }); }
}
if (once) {
  await suggest({ task: process.argv[3], language: process.env.DARWIN_IDE_LANGUAGE || '' });
} else {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', (line) => {
    try {
      pending = JSON.parse(line);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const delay = Math.max(0, 30_000 - (Date.now() - lastAt));
        timer = setTimeout(() => suggest(pending), delay);
      }, 1000);
    } catch (error) { emit({ type: 'error', message: error instanceof Error ? error.message : String(error) }); }
  });
  emit({ type: 'ready', message: 'Send {"task":"approved summary","language":"typescript"} as JSON lines.' });
}
