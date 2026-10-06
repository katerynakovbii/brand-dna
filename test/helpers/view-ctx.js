// Shared fixtures for view tests: an in-memory library and a ctx whose network calls are stubs.
import { openLibrary } from '../../assets/js/store.js';

export const ID = (c) => c.repeat(22);

export function sampleReport(overrides = {}) {
  return {
    v: 1,
    id: ID('P'),
    type: 'main',
    parentId: null,
    createdAt: '2026-10-06T10:00:00.000Z',
    status: 'ok',
    error: null,
    mode: 'rules',
    modeReason: 'No AI key configured.',
    input: { name: 'Acme', website: 'https://acme.test', industry: 'SaaS / Software', socials: {} },
    positioning: { statement: 'Project tools for small teams.', tags: ['Sage'], phrases: ['fast'] },
    touchpoints: { score: 72, expected: ['website'], items: [{ kind: 'website', url: 'https://acme.test', status: 'live' }] },
    mentions: { d30: { days: 30, total: 12, capped: false, bySource: { gnews: 12 }, weekly: [1, 2], top: [] }, items: [] },
    competitors: [{ name: 'Rival', website: 'https://rival.test', reason: 'Same category', coMentions: 2 }],
    sources: [{ source: 'website', ok: true, error: null }],
    ...overrides,
  };
}

export async function makeCtx(overrides = {}) {
  const library = overrides.library ?? (await openLibrary({ idb: null }));
  const calls = { navigate: [], copy: [], share: [], analyze: [] };
  const ctx = {
    library,
    calls,
    toastHost: globalThis.document.createElement('div'),
    navigate: (hash) => calls.navigate.push(hash),
    industries: async () => ({ default: { label: 'Other' }, saas: { label: 'SaaS / Software' } }),
    runAnalysis: async (args) => {
      calls.analyze.push(args);
      return { ok: true, report: sampleReport() };
    },
    createShareLink: async (report) => {
      calls.share.push(report);
      return `https://app.test/#/s/${ID('S')}?k=${'k'.repeat(43)}`;
    },
    loadShared: async () => ({ ok: true, report: sampleReport() }),
    copy: async (text) => { calls.copy.push(text); },
    rerender: () => {},
    ...overrides,
  };
  return ctx;
}
