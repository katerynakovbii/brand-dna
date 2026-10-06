// Private share links: the report is encrypted in the browser; the key travels only in the link's #fragment.
import { REPORT_ID_RE, REPORT_KEY_RE } from '../../shared/schema.js';
import { newReportId, generateReportKey, encryptReport, decryptReport } from '../../shared/crypto.js';

const EXPIRED = { ok: false, message: 'This link is incomplete or has expired.' };

export async function createShareLink(report, { fetchImpl = (...a) => globalThis.fetch(...a), origin = globalThis.location?.origin } = {}) {
  const id = newReportId();
  const key = generateReportKey();
  const ciphertext = await encryptReport(report, key);
  const res = await fetchImpl('/api/share', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, ciphertext }),
  });
  if (!res.ok) throw new Error(`share failed (${res.status})`);
  return `${origin}/#/s/${id}?k=${key}`;
}

export function parseShareLink(link) {
  const m = String(link).match(/#\/s\/([^?]+)\?k=(.+)$/);
  return m ? { id: m[1], key: m[2] } : null;
}

export async function loadShared(id, key, { fetchImpl = (...a) => globalThis.fetch(...a) } = {}) {
  if (!REPORT_ID_RE.test(String(id)) || !REPORT_KEY_RE.test(String(key))) return EXPIRED;
  try {
    const res = await fetchImpl(`/api/share?id=${id}`);
    if (!res.ok) return EXPIRED;
    return { ok: true, report: await decryptReport(await res.text(), key) };
  } catch {
    return EXPIRED;
  }
}
