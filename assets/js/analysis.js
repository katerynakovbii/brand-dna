import { newReportId, generateReportKey, encryptForWorkflow, decryptReport } from '../../shared/crypto.js';
import { validateInputs, REPORT_ID_RE, REPORT_KEY_RE } from '../../shared/schema.js';

export const POLL_INTERVAL_MS = 15000;
export const POLL_TIMEOUT_MS = 600000;

export async function startAnalysis({ inputs, github, library, publicJwk, now = new Date() }) {
  const v = validateInputs(inputs);
  if (!v.ok) return { ok: false, errors: v.errors };
  const reportId = newReportId();
  const reportKey = generateReportKey();
  const payload = await encryptForWorkflow({ inputs: v.value, reportKey }, publicJwk);
  await github.dispatch({ reportId, payload });
  const entry = library.upsert({
    reportId,
    reportKey,
    name: v.value.name,
    type: v.value.type,
    parentId: v.value.parentId,
    createdAt: now.toISOString(),
    status: 'running',
  });
  return { ok: true, entry };
}

export async function loadReport({ id, key, fetchText }) {
  if (!REPORT_ID_RE.test(id ?? '') || !REPORT_KEY_RE.test(key ?? '')) return { state: 'invalid-key' };
  const text = await fetchText(id);
  if (text == null) return { state: 'pending' };
  let report;
  try {
    report = await decryptReport(text, key);
  } catch {
    return { state: 'invalid-key' };
  }
  if (report?.id !== id) return { state: 'invalid-key' };
  return { state: 'ready', report };
}

const defaultSleep = (ms, signal) =>
  new Promise((resolve) => {
    if (signal?.aborted) { resolve(); return; }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });

export async function pollReport({
  id, key, fetchText, signal,
  startedAt = Date.now(), intervalMs = POLL_INTERVAL_MS, timeoutMs = POLL_TIMEOUT_MS,
  clock = Date.now, sleep = defaultSleep,
}) {
  for (;;) {
    if (signal?.aborted) return { state: 'aborted' };
    let r = { state: 'pending' };
    try {
      r = await loadReport({ id, key, fetchText });
    } catch (e) {
      if (e?.name === 'TokenRejectedError') return { state: 'error', message: e.message };
      // network hiccup: keep polling
    }
    if (r.state !== 'pending') return r;
    if (clock() - startedAt >= timeoutMs) return { state: 'timeout' };
    await sleep(intervalMs, signal);
  }
}

export function recordResult(library, report, key) {
  if (!report || typeof report !== 'object' || typeof report.id !== 'string') return null;
  try {
    const existing = library.get(report.id);
    return library.upsert({
      reportId: report.id,
      reportKey: key,
      name: report.input?.name ?? existing?.name ?? 'Untitled',
      type: report.type,
      parentId: report.parentId,
      createdAt: report.createdAt ?? existing?.createdAt,
      status: report.status,
    });
  } catch {
    return null;
  }
}

export const isStale = (entry, now = Date.now()) =>
  entry.status === 'running' && now - Date.parse(entry.createdAt) > POLL_TIMEOUT_MS;
