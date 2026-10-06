import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDocument } from 'yaml';

const yml = readFileSync(new URL('../../.github/workflows/analyze.yml', import.meta.url), 'utf8');
const script = new URL('../../scripts/commit-report.sh', import.meta.url).pathname;

test('workflow file is valid YAML', () => {
  assert.deepEqual(parseDocument(yml).errors.map((e) => e.message), []);
});

test('untrusted inputs and secrets only reach steps through env', () => {
  for (const line of yml.split('\n').filter((l) => /\$\{\{\s*(inputs|secrets)\./.test(l))) {
    assert.match(line.trim(), /^(run-name|[A-Z_]+):/, `inline expression outside env: ${line}`);
  }
});

test('workflow shape matches the spec', () => {
  assert.match(yml, /workflow_dispatch:/);
  assert.match(yml, /permissions:\n {2}contents: write/);
  assert.doesNotMatch(yml, /concurrency:/);
  assert.match(yml, /\^\[A-Za-z0-9_-\]\{22\}\$/);
  assert.match(yml, /node collector\/run\.mjs/);
  assert.match(yml, /if: failure\(\)\n\s+env:[\s\S]*?node collector\/fail\.mjs/);
  assert.match(yml, /node-version: 24/);
});

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', RETRY_SLEEP: '0' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8' });

function repos() {
  const dir = mkdtempSync(join(tmpdir(), 'bdna-git-'));
  git(dir, 'init', '-q', '--bare', 'origin.git');
  execFileSync('git', ['--git-dir', join(dir, 'origin.git'), 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  git(dir, 'clone', '-q', 'origin.git', 'a');
  const a = join(dir, 'a');
  git(a, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  writeFileSync(join(a, 'README.md'), 'x');
  git(a, 'add', '.');
  git(a, 'commit', '-qm', 'init');
  git(a, 'push', '-q', 'origin', 'main');
  git(dir, 'clone', '-q', 'origin.git', 'b');
  return { dir, a, b: join(dir, 'b'), origin: join(dir, 'origin.git') };
}

function addReport(repo, id) {
  mkdirSync(join(repo, 'reports'), { recursive: true });
  writeFileSync(join(repo, 'reports', `${id}.enc`), '{}');
}

const ID1 = 'A'.repeat(22);
const ID2 = 'b-_'.padEnd(22, 'c');
const ID3 = 'd'.repeat(22);

test('commit script pushes the report', () => {
  const { a, origin } = repos();
  addReport(a, ID1);
  execFileSync('bash', [script, `reports/${ID1}.enc`, `report: ${ID1}`], { cwd: a, env });
  assert.ok(execFileSync('git', ['--git-dir', origin, 'log', '--oneline', 'main'], { encoding: 'utf8' }).includes(`report: ${ID1}`));
});

test('commit script rebases and retries when another run pushed first', () => {
  const { a, b, origin } = repos();
  addReport(a, ID2);
  execFileSync('bash', [script, `reports/${ID2}.enc`, `report: ${ID2}`], { cwd: a, env });
  addReport(b, ID3);
  const out = execFileSync('bash', [script, `reports/${ID3}.enc`, `report: ${ID3}`], { cwd: b, env, encoding: 'utf8' });
  assert.match(out, /attempt 2/);
  const log = execFileSync('git', ['--git-dir', origin, 'log', '--oneline', 'main'], { encoding: 'utf8' });
  assert.ok(log.includes(`report: ${ID2}`));
  assert.ok(log.includes(`report: ${ID3}`));
});

test('commit script is a no-op when the report file is missing', () => {
  const { a } = repos();
  const r = spawnSync('bash', [script, `reports/${ID1}.enc`, 'report: none'], { cwd: a, env, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No report file/);
});

test('commit script rejects an invalid report id without echoing it', () => {
  const { a, origin } = repos();
  const bad = 'x y; rm -rf';
  mkdirSync(join(a, 'reports'), { recursive: true });
  writeFileSync(join(a, 'reports', `${bad}.enc`), '{}');
  for (const f of [`reports/${bad}.enc`, 'reports/short.enc', `reports/${'a'.repeat(23)}.enc`, 'reports/../x.enc']) {
    const r = spawnSync('bash', [script, f, 'report: bad'], { cwd: a, env, encoding: 'utf8' });
    assert.notEqual(r.status, 0, f);
    assert.ok(!(r.stdout + r.stderr).includes('rm -rf'));
  }
  assert.ok(!execFileSync('git', ['--git-dir', origin, 'log', '--oneline', 'main'], { encoding: 'utf8' }).includes('report: bad'));
});

test('commit step runs after failures but only when id validation succeeded', () => {
  assert.match(yml, /name: Validate report id\n\s+id: validate/);
  assert.match(yml, /name: Commit report\n\s+if: always\(\) && steps\.validate\.outcome == 'success'/);
});

test('analyze step timeout stays below the browser poll timeout', () => {
  assert.match(yml, /name: Analyze\n\s+timeout-minutes: 10\n/);
});

test('checkout keeps persisted credentials because the commit step pushes with them', () => {
  assert.doesNotMatch(yml, /persist-credentials/);
});
