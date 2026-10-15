const redis = require('../config/redis');


const SLIDING_WINDOW_SCRIPT = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit  = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)

if count < limit then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
  return {1, limit - count - 1, 0}
end

local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local retryAfterMs = tonumber(oldest[2]) + window - now
return {0, 0, retryAfterMs}
`;

// Behind a hosting proxy (like Render), req.ip is the proxy's address, so every user
// would share one limit. Set CLIENT_IP_HEADER (e.g. "true-client-ip" on Render) to read
// the real client IP from a header the proxy sets. Locally it stays unset and req.ip is used.
function getClientIp(req) {
  const header = process.env.CLIENT_IP_HEADER;
  if (header) {
    const value = req.get(header);
    if (value) return value.split(',')[0].trim();
  }
  return req.ip;
}

/**
 * Creates an Express middleware.
 * @param {object} options
 * @param {number} options.limit     max requests allowed in the window
 * @param {number} options.windowMs  window length in milliseconds
 * @param {string} options.name      label used in the Redis key, e.g. 'shorten'
 */
function rateLimiter({ limit, windowMs, name }) {
  return async (req, res, next) => {
    const ip = getClientIp(req);
    const key = `rl:${name}:${ip}`;
    const now = Date.now();
    const member = `${now}-${Math.random().toString(36).slice(2)}`;

    try {
      const [allowed, remaining, retryAfterMs] = await redis.eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        key,
        now,
        windowMs,
        limit,
        member
      );

      res.set('X-RateLimit-Limit', String(limit));
      res.set('X-RateLimit-Remaining', String(remaining));

      if (allowed === 1) return next();

      const retryAfterSec = Math.ceil(retryAfterMs / 1000);
      res.set('Retry-After', String(retryAfterSec));
      console.log(`[rate limited] ${name} ${ip} - retry in ${retryAfterSec}s`);
      return res.status(429).json({
        error: 'Too many requests, please try again later.',
        retryAfterSeconds: retryAfterSec,
      });
    } catch (err) {
      // Fail open: if Redis is down, let the request through instead of blocking every user.
      console.error('Rate limiter error (allowing request):', err.message);
      return next();
    }
  };
}

module.exports = rateLimiter;
