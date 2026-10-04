export async function fetchOAuthJson(url, { label, method = 'GET', headers, body, fetchImpl = fetch, timeoutMs = 20_000 } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  const timeoutMessage = `${label || 'OAuth request'} timed out after ${Math.round(timeoutMs / 1000)} ${timeoutMs === 1_000 ? 'second' : 'seconds'}.`;
  let response;
  try {
    response = await fetchImpl(url, { method, headers, body, signal });
  } catch (error) {
    if (signal.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error(timeoutMessage);
    throw error;
  }
  if (!response.ok) throw new Error(`${label || 'OAuth request'} failed: HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch (error) {
    if (signal.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error(timeoutMessage);
    throw new Error(`${label || 'OAuth request'} returned invalid JSON.`);
  }
}
