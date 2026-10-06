import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const yml = readFileSync(new URL('../../.github/workflows/analyze.yml', import.meta.url), 'utf8');
const script = new URL('../../scripts/commit-report.sh', import.meta.url).pathname;

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

test('commit script pushes the report', () => {
  const { a, origin } = repos();
  addReport(a, 'one');
  execFileSync('bash', [script, 'reports/one.enc', 'report: one'], { cwd: a, env });
  assert.match(execFileSync('git', ['--git-dir', origin, 'log', '--oneline', 'main'], { encoding: 'utf8' }), /report: one/);
});

test('commit script rebases and retries when another run pushed first', () => {
  const { a, b, origin } = repos();
  addReport(a, 'first');
  execFileSync('bash', [script, 'reports/first.enc', 'report: first'], { cwd: a, env });
  addReport(b, 'second');
  const out = execFileSync('bash', [script, 'reports/second.enc', 'report: second'], { cwd: b, env, encoding: 'utf8' });
  assert.match(out, /attempt 2/);
  const log = execFileSync('git', ['--git-dir', origin, 'log', '--oneline', 'main'], { encoding: 'utf8' });
  assert.match(log, /report: first/);
  assert.match(log, /report: second/);
});

test('commit script is a no-op when the report file is missing', () => {
  const { a } = repos();
  const r = spawnSync('bash', [script, 'reports/none.enc', 'report: none'], { cwd: a, env, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No report file/);
});
