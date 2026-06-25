const express = require('express');
const si = require('systeminformation');
const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const SETTINGS_PATH = path.join(process.env.DATA_PATH || '/app/data', 'settings.json');

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return { alerts: { tempWarning: 60, tempError: 70, ramWarning: 80, ramError: 90, diskWarning: 85, diskError: 90 } };
  }
}

// GET /api/alerts
router.get('/', async (req, res) => {
  const alerts = [];
  const cfg = loadSettings().alerts;

  try {
    const temp = await si.cpuTemperature();
    if (temp.main && temp.main > cfg.tempError) {
      alerts.push({ level: 'error', type: 'temperature', message: `Temperatura CPU critica: ${temp.main}°C`, timestamp: new Date().toISOString() });
    } else if (temp.main && temp.main > cfg.tempWarning) {
      alerts.push({ level: 'warning', type: 'temperature', message: `Temperatura CPU elevata: ${temp.main}°C`, timestamp: new Date().toISOString() });
    }
  } catch (_) {}

  try {
    const mem = await si.mem();
    const pct = Math.round((mem.used / mem.total) * 100);
    if (pct > cfg.ramError) {
      alerts.push({ level: 'error', type: 'memory', message: `RAM quasi esaurita: ${pct}% utilizzata`, timestamp: new Date().toISOString() });
    } else if (pct > cfg.ramWarning) {
      alerts.push({ level: 'warning', type: 'memory', message: `RAM elevata: ${pct}% utilizzata`, timestamp: new Date().toISOString() });
    }
  } catch (_) {}

  try {
    const fsStats = await si.fsSize();
    for (const fs of fsStats) {
      if (fs.use > cfg.diskError) {
        alerts.push({ level: 'error', type: 'storage', message: `Disco ${fs.mount} quasi pieno: ${Math.round(fs.use)}%`, timestamp: new Date().toISOString() });
      } else if (fs.use > cfg.diskWarning) {
        alerts.push({ level: 'warning', type: 'storage', message: `Disco ${fs.mount} al ${Math.round(fs.use)}% di utilizzo`, timestamp: new Date().toISOString() });
      }
    }
  } catch (_) {}

  try {
    const containers = await docker.listContainers({ all: true });
    for (const c of containers.filter(c => c.State !== 'running')) {
      alerts.push({ level: 'warning', type: 'docker', message: `Container fermo: ${c.Names[0].replace('/', '')}`, timestamp: new Date().toISOString() });
    }
  } catch (_) {}

  res.json(alerts);
});

module.exports = router;
