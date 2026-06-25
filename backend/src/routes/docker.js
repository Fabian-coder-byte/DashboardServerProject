const express = require('express');
const Docker = require('dockerode');
const router = express.Router();

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// GET /api/docker/containers
router.get('/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });

    const result = await Promise.all(containers.map(async (c) => {
      let stats = null;

      if (c.State === 'running') {
        try {
          const container = docker.getContainer(c.Id);
          const s = await container.stats({ stream: false });
          const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
          const sysDelta = s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage;
          const numCpus = s.cpu_stats.online_cpus || 1;
          stats = {
            cpuUsage: Math.round((cpuDelta / sysDelta) * numCpus * 100 * 10) / 10,
            memoryUsage: s.memory_stats.usage ?? 0,
            memoryLimit: s.memory_stats.limit ?? 0
          };
        } catch (_) { /* stats non disponibili */ }
      }

      return {
        id: c.Id.substring(0, 12),
        name: c.Names[0].replace('/', ''),
        image: c.Image,
        status: c.State,
        statusText: c.Status,
        ports: c.Ports.filter(p => p.PublicPort).map(p => `${p.PublicPort}:${p.PrivatePort}`),
        created: c.Created,
        cpuUsage: stats?.cpuUsage ?? null,
        memoryUsage: stats?.memoryUsage ?? null,
        memoryLimit: stats?.memoryLimit ?? null
      };
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/docker/containers/:id — dettaglio completo con stats live
router.get('/containers/:id', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();

    let stats = null;
    if (info.State.Running) {
      try {
        const s = await container.stats({ stream: false });
        const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
        const sysDelta = s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage;
        const numCpus = s.cpu_stats.online_cpus || 1;
        const netStats = s.networks ?? {};
        stats = {
          cpuUsage: Math.round((cpuDelta / sysDelta) * numCpus * 100 * 10) / 10,
          memoryUsage: s.memory_stats.usage ?? 0,
          memoryLimit: s.memory_stats.limit ?? 0,
          networkRx: Object.values(netStats).reduce((sum, n) => sum + (n.rx_bytes ?? 0), 0),
          networkTx: Object.values(netStats).reduce((sum, n) => sum + (n.tx_bytes ?? 0), 0)
        };
      } catch (_) {}
    }

    const ports = Object.entries(info.NetworkSettings.Ports ?? {})
      .filter(([, bindings]) => bindings)
      .map(([containerPort, bindings]) => ({
        containerPort,
        hostPort: bindings[0]?.HostPort ?? null,
        hostIp: bindings[0]?.HostIp ?? '0.0.0.0'
      }));

    res.json({
      id: info.Id.substring(0, 12),
      name: info.Name.replace('/', ''),
      image: info.Config.Image,
      status: info.State.Status,
      running: info.State.Running,
      startedAt: info.State.StartedAt,
      finishedAt: info.State.FinishedAt,
      restartCount: info.RestartCount,
      cmd: (info.Config.Cmd ?? []).join(' '),
      mounts: info.Mounts.map(m => ({ source: m.Source, destination: m.Destination, mode: m.Mode, type: m.Type })),
      networks: Object.keys(info.NetworkSettings.Networks),
      env: (info.Config.Env ?? []).map(e => {
        const [key, ...rest] = e.split('=');
        return { key, value: rest.join('=') };
      }),
      ports,
      stats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/docker/info
router.get('/info', async (req, res) => {
  try {
    const info = await docker.info();
    res.json({
      containers: info.Containers,
      running: info.ContainersRunning,
      paused: info.ContainersPaused,
      stopped: info.ContainersStopped,
      images: info.Images,
      serverVersion: info.ServerVersion,
      memTotal: info.MemTotal
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
