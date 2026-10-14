require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const { shortenUrl, redirectUrl } = require('./controllers/urlController');

const app = express();
app.use(express.json());

// Logs how long every request took, so you can compare cache HIT vs MISS
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${ms.toFixed(2)} ms`);
  });
  next();
});

// API routes first, then the catch-all /:code route
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.post('/api/shorten', shortenUrl);
app.get('/:code', redirectUrl);

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
