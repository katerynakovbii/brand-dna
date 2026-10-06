import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { runJob, writeFailure } from '../../collector/job.mjs';
import { generateWorkflowKeyPair, encryptForWorkflow, decryptReport, generateReportKey, newReportId } from '../../shared/crypto.js';

let keys;
before(async () => { keys = await generateWorkflowKeyPair(); });

async function setup({ inputs, reportKey = generateReportKey() } = {}) {
  const id = newReportId();
  const payload = await encryptForWorkflow({ inputs: inputs ?? { name: 'Acme Secret Brand', website: 'acme.test', industry: 'saas' }, reportKey }, keys.publicJwk);
  const out = { logs: [], files: {}, key: null };
  const deps = {
    env: { REPORT_ID: id, PAYLOAD: payload, WORKFLOW_PRIVATE_KEY: JSON.stringify(keys.privateJwk) },
    writeReport: async (rid, text) => { out.files[rid] = text; },
    writeKey: async (k) => { out.key = k; },
    log: (m) => out.logs.push(m),
    now: new Date('2026-10-06T00:00:00Z'),
  };
  return { id, reportKey, deps, out };
}

test('happy path: masks key, writes encrypted report, logs nothing identifying', async () => {
  const { id, reportKey, deps, out } = await setup();
  let built;
  const status = await runJob({ ...deps, buildReport: async (args) => { built = args; return { id: args.id, status: 'ok', input: args.input }; } });
  assert.equal(status, 'ok');
  assert.equal(built.input.website, 'https://acme.test/');
  assert.equal(built.ai, null);
  assert.equal(out.key, reportKey);
  assert.equal(out.logs[0], `::add-mask::${reportKey}`);
  const report = await decryptReport(out.files[id], reportKey);
  assert.equal(report.input.name, 'Acme Secret Brand');
  assert.ok(!out.logs.join('\n').includes('Acme'), 'brand never logged');
});

test('passes AI key through when configured', async () => {
  const { deps } = await setup();
  let built;
  await runJob({ ...deps, env: { ...deps.env, ANTHROPIC_API_KEY: 'sk' }, buildReport: async (a) => { built = a; return { id: a.id, status: 'ok' }; } });
  assert.deepEqual(built.ai, { apiKey: 'sk' });
});

test('analysis crash → encrypted failed report; error text not logged', async () => {
  const { id, reportKey, deps, out } = await setup();
  const status = await runJob({ ...deps, buildReport: async () => { throw new Error('fetch https://acme.test failed'); } });
  assert.equal(status, 'failed');
  const report = await decryptReport(out.files[id], reportKey);
  assert.equal(report.status, 'failed');
  assert.match(report.error, /acme\.test/);
  assert.ok(!out.logs.join('\n').includes('acme'));
  for (const m of out.logs) assert.ok(!/acme/i.test(m), 'no log call contains the brand URL');
  assert.ok(!out.logs.some((m) => m.includes(reportKey) && !m.startsWith('::add-mask::')));
});

test('write failures are rethrown as generic errors without paths or data', async () => {
  const { deps, reportKey } = await setup();
  const build = async (a) => ({ id: a.id, status: 'ok' });
  const leak = new Error('ENOENT /secret/acme/path ' + 'k');
  await assert.rejects(runJob({ ...deps, buildReport: build, writeReport: async () => { throw leak; } }),
    (e) => e.message === 'Could not write the encrypted report.');
  await assert.rejects(runJob({ ...deps, buildReport: build, writeKey: async () => { throw leak; } }),
    (e) => e.message === 'Could not write the report key file.' && !e.message.includes(reportKey));
});

test('invalid inputs → failed report', async () => {
  const { id, reportKey, deps, out } = await setup({ inputs: { name: '', website: 'javascript:x', industry: '' } });
  await runJob({ ...deps, buildReport: async () => assert.fail('should not build') });
  const report = await decryptReport(out.files[id], reportKey);
  assert.equal(report.status, 'failed');
  assert.match(report.error, /Invalid inputs/);
});

test('bad report id, bad secret, undecryptable payload → throw, nothing written', async () => {
  const { deps, out } = await setup();
  const build = async () => ({ status: 'ok' });
  await assert.rejects(runJob({ ...deps, env: { ...deps.env, REPORT_ID: '../../etc' }, buildReport: build }), /Invalid REPORT_ID/);
  await assert.rejects(runJob({ ...deps, env: { ...deps.env, WORKFLOW_PRIVATE_KEY: '' }, buildReport: build }), /WORKFLOW_PRIVATE_KEY/);
  const other = await generateWorkflowKeyPair();
  await assert.rejects(runJob({ ...deps, env: { ...deps.env, WORKFLOW_PRIVATE_KEY: JSON.stringify(other.privateJwk) }, buildReport: build }), /do not match/);
  assert.deepEqual(out.files, {});
  assert.equal(out.key, null);
});

test('writeFailure writes only when key exists and report does not', async () => {
  const id = newReportId();
  const key = generateReportKey();
  const files = {};
  const base = { env: { REPORT_ID: id }, writeReport: async (rid, t) => { files[rid] = t; }, log: () => {} };
  assert.equal(await writeFailure({ ...base, readKey: async () => null, reportExists: async () => false }), false);
  assert.equal(await writeFailure({ ...base, readKey: async () => key, reportExists: async () => true }), false);
  assert.equal(await writeFailure({ ...base, readKey: async () => key, reportExists: async () => false }), true);
  const report = await decryptReport(files[id], key);
  assert.equal(report.status, 'failed');
  assert.match(report.error, /failed or timed out/);
});
