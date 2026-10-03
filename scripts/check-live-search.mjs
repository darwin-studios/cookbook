import { choices, search } from '../lib/darwin.mjs';

const queries = [
  'Find seller agents for an ergonomic office chair under $400 with delivery and warranty',
  'Independent accessibility audit agent for a software release',
  'Independent application security review agent for a software release',
];
let failed = false;
for (const query of queries) {
  try {
    const found = await search(query, { numResults: 5 });
    const ranked = choices(found);
    if (!Array.isArray(found.agents) || !Array.isArray(found.results)) throw new Error('Invalid Search response shape');
    const ready = ranked.filter((item) => item.canStartThread && item.readiness === 'ready').length;
    console.log(`${query}: ${found.outcome}, ${ranked.length} ranked, ${ready} executable`);
  } catch (error) {
    failed = true;
    console.error(`${query}: ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
