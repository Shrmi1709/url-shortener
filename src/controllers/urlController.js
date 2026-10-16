const Url = require('../models/Url');
const { getNextSequence } = require('../models/Counter');
const { encode } = require('../utils/base62');
const redis = require('../config/redis');
const metrics = require('../utils/metrics');


const ID_OFFSET = 100_000_000;
const CACHE_TTL_SECONDS = 60 * 60 * 24; // keep a link in cache for 24 hours
const cacheKey = (code) => `url:${code}`;


const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';
const REQUEST_LOGS = process.env.REQUEST_LOGS !== 'false';


async function cacheGet(key) {
  if (!CACHE_ENABLED) return null;
  try {
    return await redis.get(key);
  } catch (err) {
    console.error('Cache read failed:', err.message);
    return null;
  }
}

async function cacheSet(key, value) {
  if (!CACHE_ENABLED) return;
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


async function redirectUrl(req, res, next) {
  const start = process.hrtime.bigint();
  const elapsedMs = () => Number(process.hrtime.bigint() - start) / 1e6;

  try {
    const { code } = req.params;

    
    const cached = await cacheGet(cacheKey(code));
    if (cached) {
      if (REQUEST_LOGS) console.log(`[cache HIT]  ${code}`);
      res.set('X-Cache', 'HIT');
      countClick(code);
      res.redirect(302, cached);
      metrics.record('redirect_cache_hit', elapsedMs());
      return;
    }

    
    const doc = await Url.findOne({ shortCode: code });
    if (!doc) return res.status(404).json({ error: 'Short URL not found' });

    
    await cacheSet(cacheKey(code), doc.originalUrl);

    if (REQUEST_LOGS) console.log(`[cache MISS] ${code}`);
    res.set('X-Cache', CACHE_ENABLED ? 'MISS' : 'DISABLED');
    countClick(code);

    
    res.redirect(302, doc.originalUrl);
    metrics.record(CACHE_ENABLED ? 'redirect_cache_miss' : 'redirect_db_only', elapsedMs());
  } catch (err) {
    next(err);
  }
}

module.exports = { shortenUrl, redirectUrl };
