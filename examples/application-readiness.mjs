import { chosenReady, discover, invokeCapability, requireReady, terminal } from '../lib/recipe.mjs';
import { describeJob, jobsFromOutcome } from '../lib/jobs.mjs';

// A career product can discover a live hiring agent and show exactly what an
// applicant needs before sending any personal information or applying.
const io = terminal();
try {
  console.log('Application readiness — inspect current roles and requirements from a live hiring agent.');
  const employer = await io.ask('Employer or hiring agent to look for (try Edenspiekermann): ');
  if (!employer) process.exit(0);
  const ranked = await discover(
    'Hiring agents',
    `${employer} jobs OpenAPI list current job openings`,
    'Find the employer’s executable, read-only capability to list current openings and application requirements.',
    { select: (item) => item.agentName.toLowerCase().includes(employer.toLowerCase()) && /list current job openings/i.test(item.name || '') },
  );
  requireReady(ranked, 'the hiring agent');
  const number = await io.ask('Choose the READY listing capability (Enter to stop): ');
  if (!number) process.exit(0);
  const choice = chosenReady(ranked, number);
  if (!/list current job openings/i.test(choice.name)) {
    console.log('This recipe only calls a current-openings listing, never an application or write action.');
    process.exit(0);
  }
  const outcome = await invokeCapability(io, choice, 'List openings');
  if (!outcome) process.exit(0);
  const jobs = jobsFromOutcome(outcome);
  console.log(`\n${jobs.length} live openings from ${choice.agentName}; thread ${outcome.thread}. No application submitted.`);
  if (!jobs.length) {
    throw new Error('No structured job result yet. Check the thread later; do not treat acceptance as a provider answer.');
  }
  for (const [index, job] of jobs.entries()) {
    const detail = describeJob(job);
    console.log(`\n${index + 1}. ${detail.name}${detail.location ? ` — ${detail.location}` : ''}`);
    console.log(`Apply: ${detail.applyUrl || 'not provided'}`);
    console.log(`Resume: ${detail.resume}`);
    console.log(`Required questions: ${detail.requiredQuestions.join('; ') || 'none listed'}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  io.close();
}
