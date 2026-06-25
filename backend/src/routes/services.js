const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const axios = require('axios');
const router = express.Router();

const CATALOG_PATH = path.join(process.env.DATA_PATH || '/app/data', 'service-catalog.yml');

function loadCatalog() {
  try {
    const content = fs.readFileSync(CATALOG_PATH, 'utf8');
    return yaml.load(content).services || [];
  } catch (err) {
    console.error('Impossibile leggere service-catalog.yml:', err.message);
    return [];
  }
}

// GET /api/services
router.get('/', (req, res) => {
  res.json(loadCatalog());
});

// GET /api/services/health
router.get('/health', async (req, res) => {
  const services = loadCatalog();

  const checks = await Promise.all(services.map(async (svc) => {
    if (!svc.healthcheck?.url) {
      return { name: svc.name, status: 'unknown', responseTime: null };
    }
    const start = Date.now();
    try {
      await axios.get(svc.healthcheck.url, { timeout: 3000 });
      return { name: svc.name, status: 'online', responseTime: Date.now() - start };
    } catch {
      return { name: svc.name, status: 'offline', responseTime: null };
    }
  }));

  res.json(checks);
});

// GET /api/services/:name/health
router.get('/:name/health', async (req, res) => {
  const service = loadCatalog().find(s => s.name.toLowerCase() === req.params.name.toLowerCase());
  if (!service) return res.status(404).json({ error: 'Servizio non trovato' });
  if (!service.healthcheck?.url) return res.json({ name: service.name, status: 'unknown', responseTime: null });

  const start = Date.now();
  try {
    await axios.get(service.healthcheck.url, { timeout: 3000 });
    res.json({ name: service.name, status: 'online', responseTime: Date.now() - start });
  } catch {
    res.json({ name: service.name, status: 'offline', responseTime: null });
  }
});

module.exports = router;
