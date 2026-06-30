'use strict';

const express = require('express');
const Docker  = require('dockerode');
const log     = require('../logger');

const router = express.Router();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// ── Helper: calcolo % CPU dal delta stats ────────────────────────────────────
function calcCpuPercent(s) {
  if (!s?.cpu_stats || !s?.precpu_stats) return null;
  const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
  const sysDelta = s.cpu_stats.system_cpu_usage    - s.precpu_stats.system_cpu_usage;
  const numCpus  = s.cpu_stats.online_cpus || 1;
  if (sysDelta <= 0) return null;
  return Math.round((cpuDelta / sysDelta) * numCpus * 100 * 10) / 10;
}

// ── Helper: estrae lo stato health dal testo Status ──────────────────────────
// Dockerode listContainers include Status = "Up 3 days (healthy)", "(unhealthy)", ecc.
function parseHealthFromStatus(statusText) {
  const m = (statusText || '').match(/\((healthy|unhealthy|starting)\)/i);
  return m ? m[1].toLowerCase() : null;
}

// ── Helper: estrae l'uptime leggibile dal testo Status ───────────────────────
function parseUptimeFromStatus(statusText) {
  const m = (statusText || '').match(/^Up (.+?)(?:\s*\(|$)/i);
  return m ? m[1].trim() : null;
}

// ── GET /api/docker/containers ───────────────────────────────────────────────
router.get('/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });

    const result = await Promise.all(containers.map(async (c) => {
      let stats   = null;
      let inspect = null;

      // Inspect leggero per restartCount — in parallelo con stats
      const [statsResult, inspectResult] = await Promise.allSettled([
        c.State === 'running'
          ? docker.getContainer(c.Id).stats({ stream: false })
          : Promise.resolve(null),
        docker.getContainer(c.Id).inspect(),
      ]);

      if (statsResult.status === 'fulfilled' && statsResult.value) {
        const s = statsResult.value;
        stats = {
          cpuUsage:    calcCpuPercent(s),
          memoryUsage: s.memory_stats?.usage  ?? 0,
          memoryLimit: s.memory_stats?.limit  ?? 0,
        };
      }
      if (inspectResult.status === 'fulfilled') {
        inspect = inspectResult.value;
      }

      return {
        id:           c.Id.substring(0, 12),
        name:         c.Names[0].replace('/', ''),
        image:        c.Image,
        status:       c.State,
        statusText:   c.Status,
        health:       parseHealthFromStatus(c.Status),
        uptime:       parseUptimeFromStatus(c.Status),
        ports:        c.Ports.filter(p => p.PublicPort).map(p => `${p.PublicPort}:${p.PrivatePort}`),
        created:      c.Created,
        restartCount: inspect?.RestartCount ?? null,
        startedAt:    inspect?.State?.StartedAt ?? null,
        cpuUsage:     stats?.cpuUsage    ?? null,
        memoryUsage:  stats?.memoryUsage ?? null,
        memoryLimit:  stats?.memoryLimit ?? null,
      };
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/docker/containers/:id — dettaglio completo ──────────────────────
router.get('/containers/:id', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const info      = await container.inspect();

    let stats = null;
    if (info.State.Running) {
      try {
        const s = await container.stats({ stream: false });
        const netStats = s.networks ?? {};
        stats = {
          cpuUsage:    calcCpuPercent(s),
          memoryUsage: s.memory_stats.usage ?? 0,
          memoryLimit: s.memory_stats.limit ?? 0,
          networkRx:   Object.values(netStats).reduce((sum, n) => sum + (n.rx_bytes ?? 0), 0),
          networkTx:   Object.values(netStats).reduce((sum, n) => sum + (n.tx_bytes ?? 0), 0),
        };
      } catch (_) { /* stats non disponibili */ }
    }

    const ports = Object.entries(info.NetworkSettings.Ports ?? {})
      .filter(([, bindings]) => bindings)
      .map(([containerPort, bindings]) => ({
        containerPort,
        hostPort: bindings[0]?.HostPort ?? null,
        hostIp:   bindings[0]?.HostIp   ?? '0.0.0.0',
      }));

    res.json({
      id:           info.Id.substring(0, 12),
      name:         info.Name.replace('/', ''),
      image:        info.Config.Image,
      status:       info.State.Status,
      health:       info.State.Health?.Status ?? null,
      running:      info.State.Running,
      startedAt:    info.State.StartedAt,
      finishedAt:   info.State.FinishedAt,
      restartCount: info.RestartCount,
      cmd:          (info.Config.Cmd ?? []).join(' '),
      mounts:       info.Mounts.map(m => ({ source: m.Source, destination: m.Destination, mode: m.Mode, type: m.Type })),
      networks:     Object.keys(info.NetworkSettings.Networks),
      env:          (info.Config.Env ?? []).map(e => {
        const [key, ...rest] = e.split('=');
        return { key, value: rest.join('=') };
      }),
      ports,
      stats,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/docker/errors ────────────────────────────────────────────────────
// Ultimi N errori/warning dai log di tutti i container in esecuzione
// Evita muri di testo: massimo 5 righe per container, solo ERROR/WARN/FATAL
router.get('/errors', async (req, res) => {
  const linesPerContainer = Math.min(parseInt(req.query.lines) || 5, 20);

  try {
    const containers = await docker.listContainers({ all: false }); // solo running
    const ERROR_RE   = /\b(error|err|fatal|panic|exception|critical|warn|warning)\b/i;

    const results = await Promise.allSettled(containers.map(async (c) => {
      const name = c.Names[0].replace('/', '');
      try {
        const container = docker.getContainer(c.Id);
        // Legge gli ultimi 200 log e filtra solo righe con errori
        const logBuffer = await container.logs({
          stdout: true, stderr: true,
          tail:   200, timestamps: true,
        });

        // Il log buffer Docker ha un header di 8 byte per frame — strip per testo leggibile
        const raw   = logBuffer.toString('utf8');
        const lines = raw.split('\n')
          .map(l => l.replace(/^[\x00-\x08][\x00-\x00]{3}[\x00-\xFF]{4}/g, '').trim())
          .filter(l => l && ERROR_RE.test(l))
          .slice(-linesPerContainer);

        return { name, lines };
      } catch (err) {
        log.warn('docker', `errori log falliti per ${name}`, err);
        return { name, lines: [] };
      }
    }));

    const data = results
      .filter(r => r.status === 'fulfilled' && r.value.lines.length > 0)
      .map(r => r.value);

    res.json({ containers: data, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/docker/info ──────────────────────────────────────────────────────
router.get('/info', async (req, res) => {
  try {
    const info = await docker.info();
    res.json({
      containers:    info.Containers,
      running:       info.ContainersRunning,
      paused:        info.ContainersPaused,
      stopped:       info.ContainersStopped,
      images:        info.Images,
      serverVersion: info.ServerVersion,
      memTotal:      info.MemTotal,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
