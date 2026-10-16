const MAX_SAMPLES = 50000;
const samples = new Map();

function record(label, ms) {
  let list = samples.get(label);
  if (!list) {
    list = [];
    samples.set(label, list);
  }
  if (list.length >= MAX_SAMPLES) list.shift();
  list.push(ms);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))];
}

function summary() {
  const out = {};
  for (const [label, list] of samples) {
    const sorted = [...list].sort((a, b) => a - b);
    const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
    out[label] = {
      count: sorted.length,
      avgMs: +avg.toFixed(2),
      p50Ms: +percentile(sorted, 50).toFixed(2),
      p95Ms: +percentile(sorted, 95).toFixed(2),
      p99Ms: +percentile(sorted, 99).toFixed(2),
    };
  }
  return out;
}

function reset() {
  samples.clear();
}

module.exports = { record, summary, reset };
