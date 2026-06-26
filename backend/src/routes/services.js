const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const axios = require('axios');
const Docker = require('dockerode');
const router = express.Router();

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

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

// Traduce localhost → host.docker.internal così gli health check raggiungono l'host Raspberry
// anche quando il backend gira dentro un container Docker
function resolveHealthUrl(url) {
  return url.replace(/^(https?:\/\/)localhost(:\d+|\/|$)/, '$1host.docker.internal$2');
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
    const url = resolveHealthUrl(svc.healthcheck.url);
    const start = Date.now();
    try {
      await axios.get(url, { timeout: 3000 });
      return { name: svc.name, status: 'online', responseTime: Date.now() - start };
    } catch {
      return { name: svc.name, status: 'offline', responseTime: null };
    }
  }));

  res.json(checks);
});

// POST /api/services/:name/compose  { action: 'start' | 'stop' | 'restart' }
router.post('/:name/compose', async (req, res) => {
  const { action } = req.body;
  if (!['start', 'stop', 'restart'].includes(action)) {
    return res.status(400).json({ error: 'Azione non valida. Usa: start, stop, restart.' });
  }

  const service = loadCatalog().find(s => s.name.toLowerCase() === req.params.name.toLowerCase());
  if (!service) return res.status(404).json({ error: 'Servizio non trovato' });

  // Il nome progetto Compose si ricava dalla directory del compose_path, oppure da compose_project esplicito
  const project = service.compose_project
    || (service.compose_path ? path.basename(path.dirname(service.compose_path)) : null);

  if (!project) {
    return res.status(400).json({ error: 'Configura compose_path o compose_project nel service-catalog.yml per questo servizio.' });
  }

  try {
    const containers = await docker.listContainers({
      all: true,
      filters: JSON.stringify({ label: [`com.docker.compose.project=${project}`] })
    });

    if (containers.length === 0) {
      return res.status(404).json({ error: `Nessun container trovato per il progetto Compose "${project}". Verifica che il servizio sia stato avviato almeno una volta con docker compose up.` });
    }

    const results = await Promise.allSettled(containers.map(async (c) => {
      const container = docker.getContainer(c.Id);
      try {
        if (action === 'start')   await container.start();
        if (action === 'stop')    await container.stop({ t: 10 });
        if (action === 'restart') await container.restart({ t: 10 });
      } catch (err) {
        // 304 = container già nello stato richiesto, non è un errore reale
        if (err.statusCode !== 304) throw err;
      }
      return c.Names[0].replace('/', '');
    }));

    const succeeded = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failed    = results.filter(r => r.status === 'rejected').map(r => r.reason?.message ?? 'Errore sconosciuto');

    res.json({ action, project, containers: containers.length, succeeded, failed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/services/:name/health
router.get('/:name/health', async (req, res) => {
  const service = loadCatalog().find(s => s.name.toLowerCase() === req.params.name.toLowerCase());
  if (!service) return res.status(404).json({ error: 'Servizio non trovato' });
  if (!service.healthcheck?.url) return res.json({ name: service.name, status: 'unknown', responseTime: null });

  const url = resolveHealthUrl(service.healthcheck.url);
  const start = Date.now();
  try {
    await axios.get(url, { timeout: 3000 });
    res.json({ name: service.name, status: 'online', responseTime: Date.now() - start });
  } catch {
    res.json({ name: service.name, status: 'offline', responseTime: null });
  }
});

module.exports = router;
