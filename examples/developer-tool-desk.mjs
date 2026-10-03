import { run } from '../lib/flow.mjs';

await run({
  title: 'Developer tool desk',
  intro: 'A build-tool assistant that finds code review, testing, debugging, or deployment agents on demand.',
  query: (task) => `Software development agent or MCP tool for: ${task}`,
  objective: (task) => `Return a verifiable developer workflow outcome for: ${task}`,
});
