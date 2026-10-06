#!/usr/bin/env node
// Local dry run: prints the plaintext report for one brand. The deployed app runs the same pipeline from api/analyze.mjs.
import { parseArgs } from 'node:util';
import { createSafeFetch } from './safeFetch.mjs';
import { buildReport } from './pipeline.mjs';
import { validateInputs } from '../shared/schema.js';
import { newReportId } from '../shared/crypto.js';

const { values } = parseArgs({
  options: {
    name: { type: 'string', default: '' },
    website: { type: 'string' },
    industry: { type: 'string', default: '' },
    social: { type: 'string', multiple: true, default: [] },
  },
});

try {
  const v = validateInputs({ name: values.name, website: values.website, industry: values.industry, socials: { other: values.social } });
  if (!v.ok) {
    console.error(v.errors);
    process.exit(2);
  }
  const ai = process.env.ANTHROPIC_API_KEY ? { apiKey: process.env.ANTHROPIC_API_KEY } : null;
  console.log(JSON.stringify(await buildReport({ id: newReportId(), input: v.value, ai, fetcher: createSafeFetch() }), null, 2));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
