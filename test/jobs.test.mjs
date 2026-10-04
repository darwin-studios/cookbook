import test from 'node:test';
import assert from 'node:assert/strict';
import { describeJob, jobsFromOutcome } from '../lib/jobs.mjs';

test('extracts only actual structured provider results', () => {
  assert.deepEqual(jobsFromOutcome({ events: [{ sender: 'runtime', payload: { type: 'status', status: 'queued' } }] }), []);
  const job = { name: 'Designer' };
  assert.deepEqual(jobsFromOutcome({ events: [{ sender: 'runtime', payload: { type: 'result', data: { data: [job] } } }] }), [job]);
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
