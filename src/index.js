require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const { shortenUrl, redirectUrl } = require('./controllers/urlController');
const rateLimiter = require('./middleware/rateLimiter');

const app = express();
app.use(express.json());


app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${ms.toFixed(2)} ms`);
  });
  next();
});

const shortenLimiter = rateLimiter({ name: 'shorten', limit: 10, windowMs: 60 * 1000 });
const redirectLimiter = rateLimiter({ name: 'redirect', limit: 100, windowMs: 60 * 1000 });

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.post('/api/shorten', shortenLimiter, shortenUrl);
app.get('/:code', redirectLimiter, redirectUrl);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
connectDB()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });
