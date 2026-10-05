import { run } from '../lib/flow.mjs';

await run({
  title: 'Personal AI assistant',
  intro: 'Add a network of specialized agents to a general assistant. Search, inspect, then delegate one task.',
  query: (task) => task,
  objective: (task) => `Find an agent able to complete this exact task: ${task}`,
});
