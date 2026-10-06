export const WINDOWS = [7, 30, 60];
const DAY = 86400000;

export function bucketMentions(items, { now, capped = {} }) {
  const nowMs = now.getTime();
  const anyCapped = Object.values(capped).some(Boolean);
  const out = {};
  for (const days of WINDOWS) {
    const withAge = items
      .map((i) => ({ i, age: Math.max(0, nowMs - Date.parse(i.date)) }))
      .filter((x) => x.age < days * DAY)
      .sort((a, b) => a.age - b.age);
    const bySource = {};
    for (const { i } of withAge) bySource[i.source] = (bySource[i.source] || 0) + 1;
    const weeks = Math.ceil(days / 7);
    const weekly = Array(weeks).fill(0);
    for (const { age } of withAge) weekly[weeks - 1 - Math.min(Math.floor(age / (7 * DAY)), weeks - 1)]++;
    out[`d${days}`] = {
      days,
      total: withAge.length,
      capped: anyCapped,
      bySource,
      top: withAge.slice(0, 10).map((x) => x.i),
      weekly,
    };
  }
  return out;
}
