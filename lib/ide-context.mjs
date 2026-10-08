import { canRequestThread, choices } from './darwin.mjs';

// The IDE adapter sends an explicit task and coarse editor metadata.
// Source text, file paths, diagnostics, and conversation history are not inputs.
export function normalizeIdeContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a context object.');
  const task = typeof value.task === 'string' ? value.task.trim().replace(/\s+/g, ' ') : '';
  const language = typeof value.language === 'string' ? value.language.trim().toLowerCase() : '';
  const workArea = typeof value.workArea === 'string' ? value.workArea.trim().toLowerCase() : '';
  if (task.length < 8 || task.length > 500) throw new Error('Task must be 8–500 characters.');
  if (language.length > 40 || (language && !/^[a-z0-9+#. -]+$/.test(language))) {
    throw new Error('Language must be a short editor language name.');
  }
  if (
    workArea &&
    !['frontend', 'backend', 'tests', 'documentation', 'configuration', 'implementation'].includes(workArea)
  ) {
    throw new Error('Work area must be a supported coarse category.');
  }
  return { task, ...(language ? { language } : {}), ...(workArea ? { workArea } : {}) };
}

export function ideSearchRequest(context) {
  const { task, language, workArea } = normalizeIdeContext(context);
  return {
    query: `${task}${language ? ` (working in ${language})` : ''}${workArea ? ` (current work area: ${workArea})` : ''}`,
    objective:
      'Find agents with specific capabilities that could directly help with this engineering task. Prefer actionable tools and services over generic advice. Rank by fit to the stated task; do not assume any provider is executable.',
  };
}

const stopwords = new Set(
  'about after also and are before building can current developer does for from have into need our that the their them there these this through trying want with working would your app flow live make must service services tool tools using verify'.split(
    ' ',
  ),
);

export function taskTerms(task) {
  const normalized = normalizeIdeContext({ task }).task;
  const acronyms = [...new Set(normalized.match(/\b[A-Z]{2,}(?:-[A-Z]{2,})*\b/g) || [])].map((term) =>
    term.toLowerCase(),
  );
  const terms = [...new Set(normalized.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [])].filter(
    (term) => term.length >= 3 && !stopwords.has(term),
  );
  return { terms, acronyms };
}

export function ideSuggestions(found, context, limit = 5) {
  const { terms, acronyms } = taskTerms(context.task);
  return choices(found)
    .map((item, index) => {
      const searchable =
        `${item.agentName} ${item.name || ''} ${(item.description || '').slice(0, 1000)}`.toLowerCase();
      const matchedTerms = terms.filter((term) =>
        new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(searchable),
      );
      const acronymMatches = acronyms.filter((term) => searchable.includes(term));
      const specificMatch = !acronyms.length || acronymMatches.length >= Math.min(2, acronyms.length);
      return { item, rank: index + 1, matchedTerms, relevant: matchedTerms.length >= 2 && specificMatch };
    })
    .filter(({ relevant }) => relevant)
    .slice(0, limit)
    .map(({ item, rank, matchedTerms }) => ({
      rank,
      searchId: item.searchId,
      responseId: item.responseId,
      connectionPrompt: item.connectionPrompt,
      reasons: item.reasons,
      uncertainties: item.uncertainties,
      agent: { id: item.agent, name: item.agentName },
      capability: {
        id: item.capability,
        name: (item.name || '').slice(0, 140),
        description: (item.description || '').replace(/\s+/g, ' ').slice(0, 300),
      },
      matchedTaskTerms: matchedTerms.slice(0, 5),
      readiness: item.readiness || 'unknown',
      canStartThread: item.canStartThread === true,
      eligibleForActAttempt: canRequestThread(item),
      ...(item.threadUnavailableReason ? { unavailableReason: item.threadUnavailableReason } : {}),
    }));
}
