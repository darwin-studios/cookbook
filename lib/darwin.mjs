const base = (process.env.DARWIN_API_BASE || 'https://api.darwin.so/api/v2').replace(/\/$/, '');

export class DarwinError extends Error {
  constructor(status, message) {
    super(`Darwin API ${status}: ${message}`);
    this.status = status;
  }
}

function headers() {
  const result = { 'Content-Type': 'application/json' };
  if (process.env.DARWIN_ACCESS_TOKEN) result.Authorization = `Bearer ${process.env.DARWIN_ACCESS_TOKEN}`;
  else if (process.env.DARWIN_API_KEY) result['x-api-key'] = process.env.DARWIN_API_KEY;
  return result;
}

export function hasActCredential() {
  return Boolean(process.env.DARWIN_ACCESS_TOKEN);
}

export async function request(path, { method = 'GET', body, fetchImpl = fetch, timeoutMs = 30_000, retryTransient = false, retryDelayMs = 500 } = {}) {
  for (let attempt = 0; attempt < (retryTransient ? 2 : 1); attempt++) {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: headers(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;
    if (retryTransient && attempt === 0 && [500, 502, 503, 504].includes(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      continue;
    }
    const message = typeof data.message === 'string' ? data.message : typeof data.error === 'string' ? data.error : response.statusText;
    throw new DarwinError(response.status, message);
  }
}

export async function search(query, { category, objective, numResults = 10, fetchImpl } = {}) {
  if (!query?.trim()) throw new Error('Search query is required');
  if (!Number.isInteger(numResults) || numResults < 1 || numResults > 50) throw new Error('numResults must be 1–50');
  return request('/search', {
    method: 'POST',
    body: { query, ...(category ? { category } : {}), ...(objective ? { objective } : {}), numResults },
    fetchImpl,
  });
}

// Use the ranked capability rows, never re-create IDs from display text.
export function choices(found) {
  const agents = new Map((found.agents || []).map((agent) => [agent.agent, agent]));
  return (found.results || []).map((result) => ({ ...result, agentName: agents.get(result.agent)?.name || result.agent }));
}

export async function startThread(choice, { messageType, messageContent, idempotencyKey, fetchImpl } = {}) {
  if (!choice?.canStartThread || choice.readiness !== 'ready') {
    throw new Error('This capability is not currently executable. Choose a ready Search result.');
  }
  if (!hasActCredential()) throw new Error('Act requires a user-scoped Darwin OAuth credential in DARWIN_ACCESS_TOKEN. An application API key only authorizes Search.');
  if (messageType !== 'message' && messageType !== 'action_request') throw new Error('Choose message or action_request');
  const start = await request('/act/threads', {
    method: 'POST',
    body: { targetAiId: choice.agent, capabilityId: choice.capability, idempotencyKey: idempotencyKey || crypto.randomUUID() },
    fetchImpl,
    retryTransient: true,
  });
  if (!start.threadId || !Number.isInteger(start.revision)) throw new Error('Act did not return a thread ID and revision.');
  const event = messageType === 'action_request'
    ? { type: 'action_request', capabilityId: choice.capability, arguments: messageContent }
    : { type: 'message', parts: [{ type: 'text', text: messageContent }] };
  const accepted = await request(`/act/threads/${encodeURIComponent(start.threadId)}/messages`, {
    method: 'POST',
    body: { clientMessageId: crypto.randomUUID(), expectedRevision: start.revision, event },
    fetchImpl,
    retryTransient: true,
  });
  if (!accepted.accepted) throw new Error('Act did not accept the message. Read the thread before retrying.');
  return { thread: start.threadId, cursor: start.cursor, revision: accepted.revision };
}

export async function getThread(thread, { cursor, wait = false } = {}) {
  const params = new URLSearchParams();
  if (cursor) params.set('afterCursor', cursor);
  if (wait) params.set('waitMs', '30000');
  const query = params.size ? `?${params}` : '';
  const page = await request(`/act/threads/${encodeURIComponent(thread)}${query}`, { timeoutMs: wait ? 45_000 : 30_000, retryTransient: true });
  return {
    ...page,
    messages: (page.events || []).map((item) => ({
      from: item.sender === 'target_ai' ? 'agent' : item.sender === 'acting_ai' ? 'you' : 'darwin',
      type: item.payload?.type,
      content: item.payload?.parts || [],
      data: item.payload?.data,
    })),
    requests: Object.values(page.requests || {}).filter((item) => !item.resolvedBy)
      .map((item) => ({ type: item.kind, request: item.id, status: 'pending' })),
    needsAttention: page.attention,
  };
}
