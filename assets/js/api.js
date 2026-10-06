// Client for POST /api/analyze: reads the NDJSON stream and resolves with the final outcome.
const TOO_LONG = 'The analysis took too long. Try again.';
const FAILED = 'The analysis failed. Try again.';
const OFFLINE = "Couldn't reach the server. Check your connection and try again.";
const RATE_LIMITED = 'Too many analyses from this network — try again in an hour.';

export async function runAnalysis({ inputs, onEvent = () => {}, signal, fetchImpl = (...a) => globalThis.fetch(...a) }) {
  let res;
  try {
    res = await fetchImpl('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(inputs),
      signal,
    });
  } catch {
    return signal?.aborted ? { ok: false, aborted: true } : { ok: false, message: OFFLINE };
  }
  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    return body.errors ? { ok: false, errors: body.errors } : { ok: false, message: FAILED };
  }
  if (res.status === 429) return { ok: false, message: RATE_LIMITED };
  if (!res.ok || !res.body) return { ok: false, message: FAILED };

  let outcome = null;
  const handle = (line) => {
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    if (event?.type === 'report') outcome = { ok: true, report: event.report };
    else if (event?.type === 'error') outcome = { ok: false, message: String(event.message || FAILED) };
    else onEvent(event);
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop();
      parts.forEach(handle);
    }
    handle(buffer + decoder.decode());
  } catch {
    if (signal?.aborted) return { ok: false, aborted: true };
  }
  if (signal?.aborted) return { ok: false, aborted: true };
  return outcome ?? { ok: false, message: TOO_LONG };
}
