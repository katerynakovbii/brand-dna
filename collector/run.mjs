#!/usr/bin/env node
// Workflow entry point. `--dry` runs locally and prints the plaintext report instead.
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createSafeFetch } from './safeFetch.mjs';
import { buildReport } from './pipeline.mjs';
import { runJob } from './job.mjs';
import { validateInputs } from '../shared/schema.js';
import { newReportId } from '../shared/crypto.js';

const root = new URL('..', import.meta.url);
const { values } = parseArgs({
  options: {
    dry: { type: 'boolean', default: false },
    name: { type: 'string' },
    website: { type: 'string' },
    industry: { type: 'string', default: 'Other' },
    social: { type: 'string', multiple: true, default: [] },
  },
});

const fetcher = createSafeFetch();
const build = (args) => buildReport({ ...args, fetcher });

async function writeReport(id, text) {
  await mkdir(new URL('reports/', root), { recursive: true });
  await writeFile(new URL(`reports/${id}.enc`, root), text);
}

try {
  if (values.dry) {
    const v = validateInputs({ name: values.name, website: values.website, industry: values.industry, socials: { other: values.social } });
    if (!v.ok) {
      console.error(v.errors);
      process.exit(2);
    }
    const ai = process.env.ANTHROPIC_API_KEY ? { apiKey: process.env.ANTHROPIC_API_KEY } : null;
    console.log(JSON.stringify(await build({ id: newReportId(), input: v.value, ai }), null, 2));
  } else {
    await runJob({
      env: process.env,
      buildReport: build,
      writeReport,
      writeKey: (key) => writeFile(process.env.KEY_FILE, key, { mode: 0o600 }),
    });
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
