const Redis = require('ioredis');

// Local: redis://localhost:6379   Upstash: rediss://default:<password>@<host>:6379
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 1, // fail fast so a Redis problem never blocks a request for long
});

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err.message));

module.exports = redis;
