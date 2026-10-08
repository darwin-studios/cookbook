export const searchId = 'srch_00000000-0000-4000-8000-000000000001';
export const responseId = 'sresp_00000000-0000-4000-8000-000000000001';
export function found(agents = [], extra = {}) {
  return {
    searchId,
    responseId,
    previousResponseId: null,
    contractVersion: 'search-v3.0',
    status: agents.length ? 'completed' : 'no_match',
    response: {
      agents: agents.map((a, i) => ({
        agentId: a.agentId || 'dns-agent',
        agentSlug: 'DNS Agent',
        capabilityId: 'check-dns',
        capabilityRevision: 1,
        rank: i + 1,
        selected: i === 0,
        name: 'Check DNS',
        description: 'Inspect live DNS SPF and DMARC records',
        readiness: 'ready',
        canStartThread: true,
        reasons: ['Matches the task'],
        uncertainties: [],
        providerCheck: 'not_attempted',
        connectionPrompt: 'Use https://index.darwin.so/agent/dns-agent?capability=check-dns',
        ...a,
      })),
      plan: null,
      question: null,
      noMatchReason: agents.length ? null : 'No eligible provider',
    },
    ...extra,
  };
}
export function started(agentId = 'dns-agent', threadId = 't1') {
  return {
    type: 'request',
    actRequestId: 'actreq_1',
    searchId,
    actingAgentId: null,
    status: 'completed',
    createdAt: '2026-10-07T00:00:00Z',
    threads: [{ agentId, capabilityId: 'check-dns', threadId, messageId: 'm1' }],
  };
}
