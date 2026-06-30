const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const log = require('./logger');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5005;

app.use(cors());
app.use(express.json());

// Request logger — una riga per chiamata con metodo, path, status e tempo
// Usa originalUrl perché Express riscrive req.path nei router montati
app.use((req, res, next) => {
  const start  = Date.now();
  const method = req.method;
  const url    = req.originalUrl.split('?')[0]; // senza query string
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log[level]('http', `${method} ${url} ${res.statusCode} ${ms}ms`);
  });
  next();
});

app.use('/api/system', require('./routes/system'));
app.use('/api/docker', require('./routes/docker'));
app.use('/api/services', require('./routes/services'));
app.use('/api/storage', require('./routes/storage'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/network', require('./routes/network'));
app.use('/api/backup',  require('./routes/backup'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  log.error('app', `Unhandled error on ${req.method} ${req.path}`, err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  log.info('app', `PiControl API running on port ${PORT}`);
});
