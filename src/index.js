require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const connectDB = require('./config/db');
const { shortenUrl, redirectUrl } = require('./controllers/urlController');
const rateLimiter = require('./middleware/rateLimiter');
const metrics = require('./utils/metrics');


const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== 'false';
const REQUEST_LOGS = process.env.REQUEST_LOGS !== 'false';

const app = express();
app.use(express.json());


if (REQUEST_LOGS) {
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${ms.toFixed(2)} ms`);
    });
    next();
  });
}

const passThrough = (req, res, next) => next();

const shortenLimiter = RATE_LIMIT_ENABLED
  ? rateLimiter({ name: 'shorten', limit: 10, windowMs: 60 * 1000 })
  : passThrough;

const redirectLimiter = RATE_LIMIT_ENABLED
  ? rateLimiter({ name: 'redirect', limit: 100, windowMs: 60 * 1000 })
  : passThrough;


app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/metrics', (req, res) =>
  res.json({ cacheEnabled: CACHE_ENABLED, rateLimitEnabled: RATE_LIMIT_ENABLED, redirect: metrics.summary() })
);
app.post('/api/metrics/reset', (req, res) => {
  metrics.reset();
  res.json({ reset: true });
});
app.post('/api/shorten', shortenLimiter, shortenUrl);
app.get('/:code', redirectLimiter, redirectUrl);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
connectDB()
  .then(() =>
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`cache: ${CACHE_ENABLED ? 'on' : 'OFF'} | rate limit: ${RATE_LIMIT_ENABLED ? 'on' : 'OFF'} | request logs: ${REQUEST_LOGS ? 'on' : 'OFF'}`);
    })
  )
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });
