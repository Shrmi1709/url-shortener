const Url = require('../models/Url');
const { getNextSequence } = require('../models/Counter');
const { encode } = require('../utils/base62');
const redis = require('../config/redis');

// Offset so codes start at 5 characters instead of "1", "2", "3"...
const ID_OFFSET = 100_000_000;
const CACHE_TTL_SECONDS = 60 * 60 * 24; // keep a link in cache for 24 hours
const cacheKey = (code) => `url:${code}`;

// If Redis is down, these return null / do nothing, and the app falls back to MongoDB.
async function cacheGet(key) {
  try {
    return await redis.get(key);
  } catch (err) {
    console.error('Cache read failed:', err.message);
    return null;
  }
}

async function cacheSet(key, value) {
  try {
    await redis.set(key, value, 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    console.error('Cache write failed:', err.message);
  }
}

function countClick(code) {
  Url.updateOne({ shortCode: code }, { $inc: { clicks: 1 } }).catch(console.error);
}

function isValidUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// POST /api/shorten   body: { "url": "https://..." }
async function shortenUrl(req, res, next) {
  try {
    const { url } = req.body;
    if (!url || !isValidUrl(url)) {
      return res.status(400).json({ error: 'Please provide a valid http/https URL' });
    }

    const seq = await getNextSequence('url');
    const shortCode = encode(seq + ID_OFFSET);

    await Url.create({ shortCode, originalUrl: url });
    await cacheSet(cacheKey(shortCode), url); // warm the cache right away

    res.status(201).json({
      shortCode,
      shortUrl: `${process.env.BASE_URL}/${shortCode}`,
      originalUrl: url,
    });
  } catch (err) {
    next(err);
  }
}

// GET /:code  -> redirects to the original URL (cache-aside pattern)
async function redirectUrl(req, res, next) {
  try {
    const { code } = req.params;

    // 1. Try Redis first
    const cached = await cacheGet(cacheKey(code));
    if (cached) {
      console.log(`[cache HIT]  ${code}`);
      res.set('X-Cache', 'HIT');
      countClick(code);
      return res.redirect(302, cached);
    }

    // 2. Cache miss: go to MongoDB
    const doc = await Url.findOne({ shortCode: code });
    if (!doc) return res.status(404).json({ error: 'Short URL not found' });

    // 3. Save in Redis so the next request is fast
    await cacheSet(cacheKey(code), doc.originalUrl);

    console.log(`[cache MISS] ${code}`);
    res.set('X-Cache', 'MISS');
    countClick(code);

    // 302 (not 301): browsers cache 301, so later clicks would never reach us.
    res.redirect(302, doc.originalUrl);
  } catch (err) {
    next(err);
  }
}

module.exports = { shortenUrl, redirectUrl };
