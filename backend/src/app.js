const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5005;

app.use(cors());
app.use(express.json());

app.use('/api/system', require('./routes/system'));
app.use('/api/docker', require('./routes/docker'));
app.use('/api/services', require('./routes/services'));
app.use('/api/storage', require('./routes/storage'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/alerts', require('./routes/alerts'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`PiControl API running on port ${PORT}`);
});
