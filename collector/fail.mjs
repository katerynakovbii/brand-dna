#!/usr/bin/env node
// Runs in the workflow's `if: failure()` step so the browser stops waiting.
import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { writeFailure } from './job.mjs';

const root = new URL('..', import.meta.url);
const file = (id) => new URL(`reports/${id}.enc`, root);

try {
  await writeFailure({
    env: process.env,
    readKey: () => readFile(process.env.KEY_FILE ?? '', 'utf8').then((s) => s.trim(), () => null),
    reportExists: (id) => access(file(id)).then(() => true, () => false),
    writeReport: async (id, text) => {
      await mkdir(new URL('reports/', root), { recursive: true });
      await writeFile(file(id), text);
    },
  });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
