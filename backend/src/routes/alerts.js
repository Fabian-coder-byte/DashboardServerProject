const express = require('express');
const si = require('systeminformation');
const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const log = require('../logger');

const router = express.Router();
const execAsync = promisify(exec);

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const SETTINGS_PATH = path.join(process.env.DATA_PATH || '/app/data', 'settings.json');
const BACKUP_PATH   = path.join(process.env.DATA_PATH || '/app/data', 'backup-status.json');

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return { alerts: { tempWarning: 75, tempError: 85, ramWarning: 80, ramError: 90, diskWarning: 85, diskError: 90 } };
  }
}

// GET /api/alerts
router.get('/', async (req, res) => {
  const alerts = [];
  const cfg = loadSettings().alerts;
  const now = new Date().toISOString();

  // ── Temperatura ───────────────────────────────────────────────────────────
  try {
    const temp = await si.cpuTemperature();
    if (temp.main && temp.main > (cfg.tempError ?? 85)) {
      alerts.push({ level: 'error', type: 'temperature', message: `Temperatura CPU critica: ${temp.main}°C`, timestamp: now });
    } else if (temp.main && temp.main > (cfg.tempWarning ?? 75)) {
      alerts.push({ level: 'warning', type: 'temperature', message: `Temperatura CPU alta: ${temp.main}°C — possibile throttling`, timestamp: now });
    }
  } catch (err) { log.warn('alerts', 'lettura temperatura fallita', err); }

  // ── RAM ──────────────────────────────────────────────────────────────────
  try {
    const mem = await si.mem();
    const pct = Math.round((mem.used / mem.total) * 100);
    if (pct > (cfg.ramError ?? 90)) {
      alerts.push({ level: 'error', type: 'memory', message: `RAM quasi esaurita: ${pct}% utilizzata`, timestamp: now });
    } else if (pct > (cfg.ramWarning ?? 80)) {
      alerts.push({ level: 'warning', type: 'memory', message: `RAM elevata: ${pct}% utilizzata`, timestamp: now });
    }
  } catch (err) { log.warn('alerts', 'lettura RAM fallita', err); }

  // ── Disco /mnt/storage1 non montato (controllo critico) ──────────────────
  try {
    await execAsync('nsenter -t 1 -m -- mountpoint -q /mnt/storage1', { timeout: 5000 });
    // exit 0 → montato, nessun alert
  } catch (err) {
    const msg = err.code === 1
      ? '/mnt/storage1 non montato — Jellyfin, Immich e Nextcloud potrebbero non avere accesso ai dati'
      : '/mnt/storage1 non verificabile — nsenter non disponibile';
    if (err.code !== 1) log.warn('alerts', 'controllo mount /mnt/storage1 fallito', err);
    alerts.push({ level: 'error', type: 'storage-mount', message: msg, timestamp: now });
  }

  // ── Spazio disco ─────────────────────────────────────────────────────────
  try {
    const fsStats = await si.fsSize();
    for (const f of fsStats) {
      if (f.use > (cfg.diskError ?? 90)) {
        alerts.push({ level: 'error', type: 'storage', message: `Disco ${f.mount} quasi pieno: ${Math.round(f.use)}% (${100 - Math.round(f.use)}% libero)`, timestamp: now });
      } else if (f.use > (cfg.diskWarning ?? 85)) {
        alerts.push({ level: 'warning', type: 'storage', message: `Disco ${f.mount} al ${Math.round(f.use)}% di utilizzo`, timestamp: now });
      }
    }
  } catch (err) { log.warn('alerts', 'lettura filesystem fallita', err); }

  // ── Tailscale offline ────────────────────────────────────────────────────
  try {
    const { stdout } = await execAsync(
      'nsenter -t 1 -n -- ip link show ts0 2>/dev/null || nsenter -t 1 -n -- ip link show tailscale0 2>/dev/null || true',
      { timeout: 4000 }
    );
    if (!stdout.trim()) {
      alerts.push({ level: 'warning', type: 'tailscale', message: 'Tailscale offline — accesso remoto non disponibile', timestamp: now });
    }
  } catch (err) {
    log.warn('alerts', 'controllo Tailscale fallito', err);
    alerts.push({ level: 'warning', type: 'tailscale', message: 'Tailscale offline — accesso remoto non disponibile', timestamp: now });
  }

  // ── Container Docker fermi ────────────────────────────────────────────────
  try {
    const containers = await docker.listContainers({ all: true });
    for (const c of containers.filter(c => c.State !== 'running')) {
      alerts.push({ level: 'warning', type: 'docker', message: `Container fermo: ${c.Names[0].replace('/', '')}`, timestamp: now });
    }
  } catch (err) { log.warn('alerts', 'lettura container Docker fallita', err); }

  // ── Backup ────────────────────────────────────────────────────────────────
  try {
    const backupData = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
    const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
    for (const b of (backupData.backups ?? [])) {
      if (b.status === 'failed') {
        alerts.push({ level: 'error', type: 'backup', message: `Backup fallito: ${b.name}`, timestamp: now });
      } else if (b.status === 'never') {
        alerts.push({ level: 'warning', type: 'backup', message: `Backup mai eseguito: ${b.name}`, timestamp: now });
      } else if (b.lastRun && (Date.now() - new Date(b.lastRun).getTime()) > TWO_DAYS) {
        alerts.push({ level: 'warning', type: 'backup', message: `Backup non eseguito da più di 2 giorni: ${b.name}`, timestamp: now });
      }
    }
  } catch (err) { log.warn('alerts', 'lettura backup-status.json fallita', err); }

  res.json(alerts);
});

module.exports = router;
