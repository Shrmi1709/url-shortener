const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
  for (let i = 1; i <= 12; i++) {
    const res = await fetch(`${BASE}/api/shorten`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://example.com/test-${i}` }),
    });
    const remaining = res.headers.get('x-ratelimit-remaining');
    const retry = res.headers.get('retry-after');
    console.log(
      `Request ${String(i).padStart(2)} -> ${res.status}` +
        `  remaining: ${remaining}` +
        (retry ? `  retry after: ${retry}s` : '')
    );
  }
}

main().catch((err) => console.error('Test failed:', err.message));
