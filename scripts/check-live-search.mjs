import { choices, search } from '../lib/darwin.mjs';

const queries = [
  'MCP tool whoami identify caller no arguments',
  'Software development agent for code review',
  'Extract line items from scanned invoices into structured JSON',
];
let failed = false;
for (const query of queries) {
  try {
    const found = await search(query, { numResults: 5 });
    const ranked = choices(found);
    if (!Array.isArray(found.agents) || !ranked.length) throw new Error('No ranked agents');
    const ready = ranked.filter((item) => item.canStartThread && item.readiness === 'ready').length;
    console.log(`${query}: ${found.outcome}, ${ranked.length} ranked, ${ready} executable`);
  } catch (error) {
    failed = true;
    console.error(`${query}: ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
