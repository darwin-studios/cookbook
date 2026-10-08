const base = (process.env.DARWIN_API_BASE || 'https://api.darwin.so/api/v3').replace(/\/$/, '');
const newRequestId = () => crypto.randomUUID();
const sessions = new Map();

export class DarwinError extends Error {
  constructor(status, message, code = null, details = null) {
    super(`Darwin API ${status}${code ? ` [${code}]` : ''}: ${message}`);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function hasActCredential() {
  return Boolean(process.env.DARWIN_ACCESS_TOKEN);
}
export function canRequestThread(choice) {
  return Boolean(
    choice &&
    choice.readiness !== 'unavailable' &&
    (choice.canStartThread === true ||
      choice.readiness === 'recheck_required' ||
      choice.readiness === 'authentication_required'),
  );
}

export async function request(
  path,
  {
    method = 'GET',
    body,
    fetchImpl = fetch,
    timeoutMs = 45_000,
    retryTransient = false,
    retryDelayMs = 500,
    idempotencyKey,
    searchToken,
  } = {},
) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.DARWIN_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.DARWIN_ACCESS_TOKEN}`;
  else if (process.env.DARWIN_API_KEY) headers['x-api-key'] = process.env.DARWIN_API_KEY;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (searchToken) headers['X-Search-Token'] = searchToken;
  for (let attempt = 0; attempt < (retryTransient && method === 'GET' ? 2 : 1); attempt++) {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;
    if (retryTransient && method === 'GET' && attempt === 0 && [500, 502, 503, 504].includes(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      continue;
    }
    const code = typeof data.code === 'string' ? data.code : null;
    const message =
      typeof data.message === 'string'
        ? data.message
        : typeof data.error === 'string'
          ? data.error
          : response.statusText;
    throw new DarwinError(response.status, message, code, data);
  }
}

/** Search and follow-ups use one endpoint. Returns the unchanged public response. */
export async function search(
  query,
  { context = [], previousResponseId, searchToken, agentCount = 'auto', maxResults = 5, fetchImpl } = {},
) {
  if (!query?.trim()) throw new Error('Search query is required');
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 20) throw new Error('maxResults must be 1–20');
  if (!Array.isArray(context) || context.length > 10) throw new Error('Search accepts up to ten context items');
  const previous = sessions.get(previousResponseId);
  const found = await request('/search', {
    method: 'POST',
    body: {
      query: query.trim(),
      agentCount,
      maxResults,
      context,
      ...(previousResponseId ? { previousResponseId } : {}),
    },
    searchToken: searchToken || previous?.searchToken,
    fetchImpl,
  });
  if (!found.searchId || !found.responseId || !Array.isArray(found.response?.agents))
    throw new Error('Invalid Search response shape');
  const token = found.searchToken || previous?.searchToken;
  sessions.set(found.responseId, {
    searchToken: token,
    query: previous ? `${previous.query}\n${query.trim()}` : query.trim(),
  });
  return found;
}

// Local display aliases keep all recipes on the same adapter; IDs come only from Search.
export function choices(found) {
  if (!Array.isArray(found.response?.agents)) throw new Error('Invalid Search response shape');
  return found.response.agents.map((agent) => ({
    ...agent,
    agent: agent.agentId,
    capability: agent.capabilityId,
    agentName: agent.agentSlug || agent.agentId,
    searchId: found.searchId,
    responseId: found.responseId,
    searchToken: found.searchToken || sessions.get(found.responseId)?.searchToken,
    query: sessions.get(found.responseId)?.query || agent.name,
  }));
}

export async function act(body, { idempotencyKey = newRequestId(), searchToken, fetchImpl } = {}) {
  if (!hasActCredential())
    throw new Error(
      'Act requires a user-scoped Darwin OAuth credential in DARWIN_ACCESS_TOKEN. An application Search key cannot act for a user.',
    );
  return request('/act', { method: 'POST', body, idempotencyKey, searchToken, fetchImpl });
}

export async function startThread(choice, { messageType, messageContent, idempotencyKey, fetchImpl } = {}) {
  if (!canRequestThread(choice))
    throw new Error('This capability is not eligible for an Act attempt. Choose another Search result.');
  if (!choice.agent || !choice.capability) throw new Error('Use exact agent and capability IDs returned by Search.');
  if (!['message', 'action_request'].includes(messageType)) throw new Error('Choose message or action_request.');
  if (messageType === 'message' && (typeof messageContent !== 'string' || !messageContent.trim()))
    throw new Error('A nonempty message is required.');
  if (
    messageType === 'action_request' &&
    (!messageContent || Array.isArray(messageContent) || typeof messageContent !== 'object')
  )
    throw new Error('Action arguments must be a JSON object.');
  const message =
    messageType === 'message' ? messageContent.trim() : choice.query || `Run ${choice.name || choice.capability}`;
  const body = choice.searchId
    ? {
        searchId: choice.searchId,
        agentIds: [choice.agent],
        message,
        ...(messageType === 'action_request' ? { arguments: { [choice.agent]: messageContent } } : {}),
      }
    : {
        targets: [
          {
            agentId: choice.agent,
            capabilityId: choice.capability,
            ...(messageType === 'action_request' ? { arguments: messageContent } : {}),
          },
        ],
        message,
      };
  const result = await act(body, { idempotencyKey, searchToken: choice.searchToken, fetchImpl });
  const child = result.threads?.find((item) => item.agentId === choice.agent);
  if (!child?.threadId)
    throw new DarwinError(
      422,
      'No thread was started for the selected agent.',
      child?.errorCode || 'ACT_TARGET_UNAVAILABLE',
      result,
    );
  return { thread: child.threadId, message: child.messageId, actRequestId: result.actRequestId, raw: result };
}

export async function sendThreadMessage(
  started,
  choice,
  { messageType, messageContent, idempotencyKey, fetchImpl } = {},
) {
  if (!started?.thread) throw new Error('A started thread is required.');
  let message;
  if (messageType === 'action_request') {
    if (!choice?.capability || !messageContent || Array.isArray(messageContent) || typeof messageContent !== 'object')
      throw new Error('An exact capability and JSON object arguments are required.');
    message = { type: 'action_request', capabilityId: choice.capability, arguments: messageContent };
  } else if (messageType === 'message' && typeof messageContent === 'string' && messageContent.trim())
    message = { type: 'text', text: messageContent.trim() };
  else throw new Error('Choose a nonempty message or action_request.');
  return act({ threadId: started.thread, message }, { idempotencyKey, fetchImpl });
}

export async function getThread(threadId, { cursor, fetchImpl } = {}) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  return request(`/act/threads/${encodeURIComponent(threadId)}${params.size ? `?${params}` : ''}`, {
    retryTransient: true,
    fetchImpl,
  });
}
