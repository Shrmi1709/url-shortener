const autocannon = require('autocannon');

const TARGET = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const DURATION = Number(process.env.DURATION || 20); // seconds
const CONNECTIONS = Number(process.env.CONNECTIONS || 20); // parallel users

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  // Render's free plan sleeps; keep trying for up to 2 minutes while it wakes up.
  for (let i = 0; i < 24; i++) {
    try {
      const res = await fetch(`${TARGET}/api/health`);
      if (res.ok) return;
    } catch {}
    console.log('Waiting for server to wake up...');
    await sleep(5000);
  }
  throw new Error('Server did not respond to /api/health');
}

async function main() {
  console.log(`Target: ${TARGET}`);
  await waitForServer();

  const config = await (await fetch(`${TARGET}/api/metrics`)).json();
  if (config.rateLimitEnabled) {
    console.log('\nRate limiting is ON, so most load-test requests would get 429.');
    console.log('Set RATE_LIMIT_ENABLED=false on the server, restart it, and run again.');
    return;
  }

  // Create one short link to hammer
  const created = await fetch(`${TARGET}/api/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/load-test' }),
  });
  if (!created.ok) throw new Error(`Could not create a short link (status ${created.status})`);
  const { shortCode } = await created.json();

  // One warm-up request, then clear the server's numbers so only the test counts
  await fetch(`${TARGET}/${shortCode}`, { redirect: 'manual' });
  await fetch(`${TARGET}/api/metrics/reset`, { method: 'POST' });

  console.log(`Cache: ${config.cacheEnabled ? 'ON' : 'OFF'} | ${CONNECTIONS} connections for ${DURATION}s on /${shortCode}\n`);

  const result = await autocannon({
    url: `${TARGET}/${shortCode}`,
    connections: CONNECTIONS,
    duration: DURATION,
  });

  const server = await (await fetch(`${TARGET}/api/metrics`)).json();

  console.log('===== CLIENT SIDE (includes internet travel time) =====');
  console.log(`Total requests     : ${result.requests.total}`);
  console.log(`Requests / second  : ${result.requests.average}`);
  console.log(`Latency avg        : ${result.latency.average} ms`);
  console.log(`Latency p50 / p99  : ${result.latency.p50} ms / ${result.latency.p99} ms`);
  console.log(`302 redirects      : ${result['3xx']}   errors (4xx/5xx): ${result['4xx'] + result['5xx']}   timeouts: ${result.timeouts}`);

  console.log('\n===== SERVER SIDE (time spent inside the app) =====');
  for (const [label, s] of Object.entries(server.redirect)) {
    console.log(`${label.padEnd(20)}: count ${s.count}, avg ${s.avgMs} ms, p50 ${s.p50Ms} ms, p95 ${s.p95Ms} ms, p99 ${s.p99Ms} ms`);
  }
}

main().catch((err) => console.error('Load test failed:', err.message));
