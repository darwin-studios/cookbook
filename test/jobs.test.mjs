import test from 'node:test';
import assert from 'node:assert/strict';
import { describeJob, jobsFromOutcome } from '../lib/jobs.mjs';

test('extracts only actual structured provider results', () => {
  assert.deepEqual(jobsFromOutcome({ messages: [{ type: 'message', from: 'darwin', content: [{ type: 'text', text: 'queued' }] }] }), []);
  const job = { name: 'Designer' };
  assert.deepEqual(jobsFromOutcome({ messages: [{ type: 'result', from: 'darwin', data: { data: [job] } }] }), [job]);
});

test('summarizes application requirements without applicant information', () => {
  assert.deepEqual(describeJob({
    name: 'Designer', applyUrl: 'https://example.org/apply', locations: [{ name: 'Berlin' }],
    applicationForm: { resumeRequirement: 'required', questions: [{ title: 'Portfolio URL?', required: true }, { title: 'Optional note', required: false }] },
  }), {
    name: 'Designer', location: 'Berlin', applyUrl: 'https://example.org/apply',
    resume: 'required', requiredQuestions: ['Portfolio URL?'],
  });
});
