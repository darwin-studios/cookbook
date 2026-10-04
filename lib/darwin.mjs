const base = (process.env.DARWIN_API_BASE || 'https://api.darwin.so/api/v2').replace(/\/$/, '');
const newRequestId = () => crypto.randomUUID().replaceAll('-', '');

export class DarwinError extends Error {
  constructor(status, message, code = null, details = null) {
    super(`Darwin API ${status}${code ? ` [${code}]` : ''}: ${message}`);
    this.status = status;
    this.code = code;
    this.details = details;
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
    const code = typeof data.code === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(data.code) ? data.code : null;
    const selection = code === 'THREAD_TOOL_SELECTION_REQUIRED' && Array.isArray(data.capabilities)
      ? data.capabilities.slice(0, 5).map((item) => `${item.title || 'Tool'} (${item.capability || 'unknown ID'})`).join(', ')
      : null;
    const message = selection
      ? `Choose an exact returned tool and review its input schema before starting a new thread. No tool was called. Choices: ${selection}${data.capabilities.length > 5 ? ', …' : ''}`
      : typeof data.message === 'string' ? data.message : typeof data.error === 'string' ? data.error : response.statusText;
    throw new DarwinError(response.status, message, code, data);
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

export async function startThread(choice, { idempotencyKey, fetchImpl } = {}) {
  if (!choice?.canStartThread || choice.readiness !== 'ready') {
    throw new Error('This capability is not currently executable. Choose a ready Search result.');
  }
  if (!hasActCredential()) throw new Error('Act requires a user-scoped Darwin OAuth credential in DARWIN_ACCESS_TOKEN. An application API key only authorizes Search.');
  if (!choice.agent || !choice.capability) throw new Error('Use exact agent and capability IDs returned by Search.');
  // Starting creates a thread but does not invoke a capability. A timeout has
  // an uncertain outcome; never start another thread with a new key automatically.
  return request('/act/threads', { method: 'POST', body: {
    targetAiId: choice.agent,
    capabilityId: choice.capability,
    idempotencyKey: idempotencyKey || newRequestId(),
  }, fetchImpl });
}

export async function sendThreadMessage(started, choice, { messageType, messageContent, clientMessageId, fetchImpl } = {}) {
  if (!hasActCredential()) throw new Error('Act requires a user-scoped Darwin OAuth credential.');
  if (!started?.threadId || !Number.isSafeInteger(started.revision)) throw new Error('A started thread and its latest revision are required.');
  if (messageType !== 'message' && messageType !== 'action_request') throw new Error('Choose message or action_request');
  if (messageType === 'action_request' && (!choice?.capability || !messageContent || Array.isArray(messageContent) || typeof messageContent !== 'object')) {
    throw new Error('An exact capability and JSON object arguments are required.');
  }
  if (messageType === 'action_request' && !started.capabilities?.some((item) => item.capabilityId === choice.capability)) {
    throw new Error('The chosen Search capability is absent from this thread’s executable catalog. No action was sent.');
  }
  if (messageType === 'message' && (typeof messageContent !== 'string' || !messageContent.trim())) {
    throw new Error('A nonempty message is required.');
  }
  return request(`/act/threads/${encodeURIComponent(started.threadId)}/messages`, { method: 'POST', body: {
    clientMessageId: clientMessageId || newRequestId(),
    expectedRevision: started.revision,
    event: messageType === 'action_request'
      ? { type: 'action_request', capabilityId: choice.capability, arguments: messageContent }
      : { type: 'message', parts: [{ type: 'text', text: messageContent.trim() }] },
  }, fetchImpl });
}

export async function getThread(threadId, { afterCursor, waitMs = 0, fetchImpl } = {}) {
  const params = new URLSearchParams();
  if (afterCursor) params.set('afterCursor', afterCursor);
  if (waitMs) params.set('waitMs', String(waitMs));
  const query = params.size ? `?${params}` : '';
  return request(`/act/threads/${encodeURIComponent(threadId)}${query}`, { timeoutMs: waitMs ? waitMs + 15_000 : 30_000, retryTransient: true, fetchImpl });
}
