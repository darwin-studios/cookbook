import { run } from '../lib/flow.mjs';

await run({
  title: 'Document operations desk',
  intro: 'A back-office assistant that discovers document extraction, validation, and analysis agents.',
  query: (task) => `Document processing agent for: ${task}`,
  objective: (task) => `Produce structured, source-checkable output for: ${task}`,
});
