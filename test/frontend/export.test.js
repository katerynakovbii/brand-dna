import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvEscape, mentionsCsv, compareCsv, reportJson, fileName, compareFileName, slug } from '../../assets/js/export.js';

test('csvEscape neutralizes formulas and quotes per RFC 4180 (Review Focus #4)', () => {
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape('line\nbreak'), '"line\nbreak"');
  assert.equal(csvEscape('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(csvEscape('+1'), "'+1");
  assert.equal(csvEscape('-2'), "'-2");
  assert.equal(csvEscape('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvEscape('\tx'), "'\tx");
  assert.equal(csvEscape(null), '');
});

const report = {
  input: { name: "Ben & Jerry's" }, createdAt: '2026-10-06T10:00:00.000Z',
  mentions: { items: [{ date: '2026-10-05T00:00:00.000Z', source: 'reddit', title: '=cmd, "x"', url: 'https://r.test/1' }] },
};

test('mentionsCsv has header and CRLF rows', () => {
  assert.equal(mentionsCsv(report), 'date,source,title,url\r\n2026-10-05T00:00:00.000Z,reddit,"\'=cmd, ""x""",https://r.test/1\r\n');
  assert.equal(mentionsCsv({ mentions: null }), 'date,source,title,url\r\n');
});

test('compareCsv prefixes brand column', () => {
  const b = { input: { name: 'Other' }, mentions: { items: [] } };
  assert.equal(compareCsv(report, b).split('\r\n')[0], 'brand,date,source,title,url');
  assert.match(compareCsv(report, b), /^brand.*\r\nBen & Jerry's,2026-10-05/);
});

test('compareCsv uses "brand" fallback for non-string names', () => {
  const nonStringName = { input: { name: { x: 1 } }, mentions: { items: [{ date: '2026-10-05', source: 's', title: 't', url: 'https://x.test' }] } };
  const b = { input: { name: 'Other' }, mentions: { items: [] } };
  const csv = compareCsv(nonStringName, b);
  assert.match(csv, /^brand.*\r\nbrand,2026-10-05/);
});

test('file names', () => {
  assert.equal(slug("Ben & Jerry's"), 'ben-jerry-s');
  assert.equal(slug(''), 'report');
  assert.equal(fileName(report, 'json'), 'brand-dna-ben-jerry-s-2026-10-06.json');
  assert.equal(compareFileName(report, { input: { name: 'Other' } }, 'csv'), 'brand-dna-compare-ben-jerry-s-vs-other-2026-10-06.csv');
  assert.deepEqual(JSON.parse(reportJson(report)), report);
});

test('malformed inputs do not crash (Review Focus #6)', () => {
  // mentionsCsv(null)
  assert.doesNotThrow(() => mentionsCsv(null));
  assert.equal(mentionsCsv(null), 'date,source,title,url\r\n');

  // mentionsCsv with items: {}
  assert.doesNotThrow(() => mentionsCsv({ mentions: { items: {} } }));
  assert.equal(mentionsCsv({ mentions: { items: {} } }), 'date,source,title,url\r\n');

  // mentionsCsv with malformed items and javascript URL
  const badItems = mentionsCsv({
    mentions: { items: [null, { title: 5, url: 'javascript:alert(1)' }] },
  });
  assert.doesNotThrow(() => badItems);
  // Verify the url cell for javascript: is empty and title (non-string) is coerced
  const lines = badItems.split('\r\n');
  assert.match(lines[1], /5,$/); // title coerced to '5', url cell empty at end

  // fileName(null)
  assert.doesNotThrow(() => fileName(null, 'json'));
  assert.ok(fileName(null, 'json').includes('report'));

  // fileName with createdAt: 7 (non-string)
  assert.doesNotThrow(() => fileName({ createdAt: 7 }, 'csv'));
  assert.ok(fileName({ createdAt: 7 }, 'csv').includes('json') === false);

  // compareCsv(null, null)
  assert.doesNotThrow(() => compareCsv(null, null));
  assert.equal(compareCsv(null, null), 'brand,date,source,title,url\r\n');
});
