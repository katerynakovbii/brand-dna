import { handleAnalyze } from '../server/analyze.mjs';
import { buildReport } from '../collector/pipeline.mjs';
import { createSafeFetch } from '../collector/safeFetch.mjs';

export function POST(request) {
  return handleAnalyze(request, { buildReport, fetcher: createSafeFetch(), env: process.env });
}
