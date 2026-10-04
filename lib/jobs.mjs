import { providerMessages } from './recipe.mjs';

export function jobsFromOutcome(outcome) {
  const result = providerMessages(outcome?.messages).find((message) => message.type === 'result');
  const data = result?.data;
  const jobs = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  return jobs.filter((job) => job && typeof job === 'object');
}

export function describeJob(job) {
  const required = (job.applicationForm?.questions || [])
    .filter((question) => question.required && question.title)
    .map((question) => question.title);
  return {
    name: job.name || 'Untitled role',
    location: Array.isArray(job.locations)
      ? job.locations.map((location) => typeof location === 'string' ? location : location.name || location.city).filter(Boolean).join(', ')
      : '',
    applyUrl: job.applyUrl || job.externalApplicationUrl || job.careerSiteUrl || '',
    resume: job.applicationForm?.resumeRequirement || 'not specified',
    requiredQuestions: required,
  };
}
