const PRESENT = new Set(['live', 'found', 'unverified']);

function profileStatus(p) {
  if (p.check === 'unverified') return 'unverified';
  if (p.check === 'unreachable') return 'broken';
  return p.discovered ? 'found' : 'live';
}

export function computeTouchpoints({ website, socials, websiteUrl, industryKey, table }) {
  const expected = table[industryKey]?.expected ?? table.default.expected;
  const site = website.ok ? website.data : null;
  const items = [
    { kind: 'website', url: websiteUrl ?? null, status: site ? 'live' : websiteUrl ? 'broken' : 'missing', discovered: false },
    { kind: 'blog', url: null, status: site?.hasBlog ? 'live' : 'missing', discovered: false },
    { kind: 'newsletter', url: site?.feedUrl ?? null, status: site?.feedUrl ? 'live' : 'missing', discovered: false },
  ];
  for (const p of socials.ok ? socials.data.profiles : []) {
    items.push({ kind: p.platform, url: p.url, status: profileStatus(p), discovered: p.discovered });
  }
  for (const kind of expected) {
    if (!items.some((i) => i.kind === kind)) items.push({ kind, url: null, status: 'missing', discovered: false });
  }
  const final = items.filter((i) => i.status !== 'missing' || expected.includes(i.kind));
  const present = new Set(final.filter((i) => PRESENT.has(i.status)).map((i) => i.kind));
  const score = expected.length ? Math.round((100 * expected.filter((k) => present.has(k)).length) / expected.length) : 0;
  return { score, expected, items: final };
}
