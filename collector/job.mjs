// Workflow-side orchestration. Logs must never contain brand data: everything specific
// goes into the encrypted report, logs get generic messages only.
import { decryptFromBrowser, encryptReport } from '../shared/crypto.js';
import { validateInputs, failedReport, REPORT_ID_RE, REPORT_KEY_RE } from '../shared/schema.js';

// Wrap IO so thrown errors never carry paths or data into public logs.
async function generic(fn, message) {
  try {
    return await fn();
  } catch {
    throw new Error(message);
  }
}

export async function runJob({ env, buildReport, writeReport, writeKey, log = console.log, now = new Date() }) {
  const id = env.REPORT_ID ?? '';
  if (!REPORT_ID_RE.test(id)) throw new Error('Invalid REPORT_ID.');

  let privateJwk;
  try {
    privateJwk = JSON.parse(env.WORKFLOW_PRIVATE_KEY);
  } catch {
    throw new Error('WORKFLOW_PRIVATE_KEY secret is missing or is not valid JSON. See README setup.');
  }

  let payload;
  try {
    payload = await decryptFromBrowser(env.PAYLOAD ?? '', privateJwk);
  } catch {
    throw new Error('Could not decrypt the request: keys/workflow-public.jwk and the WORKFLOW_PRIVATE_KEY secret do not match. Re-run scripts/setup.mjs and update both.');
  }

  const reportKey = payload?.reportKey ?? '';
  if (!REPORT_KEY_RE.test(reportKey)) throw new Error('Request has no valid report key.');
  log(`::add-mask::${reportKey}`);
  await generic(() => writeKey(reportKey), 'Could not write the report key file.');

  const v = validateInputs(payload.inputs);
  let report;
  if (!v.ok) {
    log('Inputs failed validation; writing a failed report.');
    report = failedReport({ id, input: payload.inputs ?? null, error: `Invalid inputs: ${Object.values(v.errors).join(' ')}`, now });
  } else {
    try {
      report = await buildReport({ id, input: v.value, now, ai: env.ANTHROPIC_API_KEY ? { apiKey: env.ANTHROPIC_API_KEY } : null });
    } catch (e) {
      log('Analysis failed; details are in the encrypted report.');
      report = failedReport({ id, input: v.value, error: `Analysis failed: ${e.message}`, now });
    }
  }

  await generic(async () => writeReport(id, await encryptReport(report, reportKey)), 'Could not write the encrypted report.');
  log(`Report ${id} written (status: ${report.status}).`);
  return report.status;
}

export async function writeFailure({ env, readKey, reportExists, writeReport, log = console.log, now = new Date() }) {
  const id = env.REPORT_ID ?? '';
  if (!REPORT_ID_RE.test(id)) {
    log('No valid report id; nothing to write.');
    return false;
  }
  if (await generic(() => reportExists(id), 'Could not check for an existing report.')) {
    log('Report already written.');
    return false;
  }
  const key = (await generic(() => readKey(), 'Could not read the report key file.')) ?? '';
  if (!REPORT_KEY_RE.test(key)) {
    log('Request was never decrypted; nothing to write.');
    return false;
  }
  const report = failedReport({ id, error: 'The analysis run failed or timed out. Open the run in GitHub Actions for details.', now });
  await generic(async () => writeReport(id, await encryptReport(report, key)), 'Could not write the failure report.');
  log(`Failure report ${id} written.`);
  return true;
}
