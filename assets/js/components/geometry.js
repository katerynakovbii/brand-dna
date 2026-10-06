const r2 = (n) => Math.round(n * 100) / 100;

export function sparklinePoints(values, width, height, pad = 2) {
  if (!Array.isArray(values) || !values.length) return '';
  const clean = values.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
  const vals = clean.length === 1 ? [clean[0], clean[0]] : clean;
  const max = Math.max(...vals);
  const min = Math.min(0, ...vals);
  const span = max - min;
  const stepX = (width - 2 * pad) / (vals.length - 1);
  return vals
    .map((v, i) => {
      const y = span === 0 ? (max === 0 ? height - pad : pad) : height - pad - ((v - min) / span) * (height - 2 * pad);
      return `${r2(pad + i * stepX)},${r2(y)}`;
    })
    .join(' ');
}

export function ringDash(score, r) {
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, Number(score) || 0));
  return { c, dash: c * (pct / 100) };
}
