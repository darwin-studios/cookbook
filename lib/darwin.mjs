const base = (process.env.DARWIN_API_BASE || 'https://api.darwin.so/api/v2').replace(/\/$/, '');

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

export async function startThread(choice, { messageType, messageContent, idempotencyKey, fetchImpl } = {}) {
  if (!choice?.canStartThread || choice.readiness !== 'ready') {
    throw new Error('This capability is not currently executable. Choose a ready Search result.');
  }
  if (!hasActCredential()) throw new Error('Act requires a user-scoped Darwin OAuth credential in DARWIN_ACCESS_TOKEN. An application API key only authorizes Search.');
  if (messageType !== 'message' && messageType !== 'action_request') throw new Error('Choose message or action_request.');
  if (messageType === 'message' && (typeof messageContent !== 'string' || !messageContent.trim())) {
    throw new Error('A nonempty message is required.');
  }
  if (messageType === 'action_request' && (!messageContent || Array.isArray(messageContent) || typeof messageContent !== 'object')) {
    throw new Error('Action arguments must be a JSON object.');
  }
  // The public Act contract atomically starts the thread and accepts its first message.
  // A timeout has an uncertain outcome; never start a second thread with a new key automatically.
  return request('/act/threads', { method: 'POST', body: {
    targetAgent: choice.agent,
    messageType,
    messageContent: messageType === 'action_request'
      ? { capability: choice.capability, arguments: messageContent }
      : messageContent,
    idempotencyKey: idempotencyKey || crypto.randomUUID(),
  }, fetchImpl });
}

export async function sendThreadMessage(started, choice, { messageType, messageContent, idempotencyKey, fetchImpl } = {}) {
  if (!hasActCredential()) throw new Error('Act requires a user-scoped Darwin OAuth credential.');
  if (!started?.thread) throw new Error('A started thread is required.');
  if (messageType !== 'message' && messageType !== 'action_request') throw new Error('Choose message or action_request');
  if (messageType === 'action_request' && (!choice?.capability || !messageContent || Array.isArray(messageContent) || typeof messageContent !== 'object')) {
    throw new Error('An exact capability and JSON object arguments are required.');
  }
  if (messageType === 'message' && (typeof messageContent !== 'string' || !messageContent.trim())) {
    throw new Error('A nonempty message is required.');
  }
  return request(`/act/threads/${encodeURIComponent(started.thread)}/messages`, { method: 'POST', body: {
    thread: started.thread,
    messageType,
    messageContent: messageType === 'action_request'
      ? { capability: choice.capability, arguments: messageContent }
      : messageContent,
    idempotencyKey: idempotencyKey || crypto.randomUUID(),
  }, fetchImpl });
}

export async function getThread(threadId, { cursor, wait = false, fetchImpl } = {}) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (wait) params.set('wait', 'true');
  const query = params.size ? `?${params}` : '';
  return request(`/act/threads/${encodeURIComponent(threadId)}${query}`, { timeoutMs: wait ? 45_000 : 30_000, retryTransient: true, fetchImpl });
}
