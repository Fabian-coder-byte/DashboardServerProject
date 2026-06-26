const express = require('express');
const si = require('systeminformation');
const router = express.Router();

// ── Ring buffer metriche storiche (max 10 min, campione ogni 10 s) ────────────
const HISTORY_MAX = 60;
const metricsHistory = [];

async function collectSample() {
  try {
    const [load, mem, temp, net] = await Promise.all([
      si.currentLoad(), si.mem(), si.cpuTemperature(), si.networkStats()
    ]);
    metricsHistory.push({
      t:      Math.floor(Date.now() / 1000),
      cpu:    Math.round(load.currentLoad * 10) / 10,
      ram:    Math.round((mem.used / mem.total) * 100),
      temp:   temp.main !== null && temp.main !== undefined ? Math.round(temp.main * 10) / 10 : null,
      netRx:  Math.round(net.reduce((s, n) => s + (n.rx_sec ?? 0), 0)),
      netTx:  Math.round(net.reduce((s, n) => s + (n.tx_sec ?? 0), 0))
    });
    if (metricsHistory.length > HISTORY_MAX) metricsHistory.shift();
  } catch (_) {}
}

collectSample();
setInterval(collectSample, 10000);

// GET /api/system/overview
router.get('/overview', async (req, res) => {
  try {
    const [load, mem, temp, osInfo, time, net] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.cpuTemperature(),
      si.osInfo(),
      si.time(),
      si.networkStats()
    ]);

    res.json({
      hostname: osInfo.hostname,
      platform: osInfo.platform,
      distro: osInfo.distro,
      uptime: time.uptime,
      cpuUsage: Math.round(load.currentLoad * 10) / 10,
      ram: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        usedPercent: Math.round((mem.used / mem.total) * 100)
      },
      swap: {
        total: mem.swaptotal,
        used: mem.swapused,
        free: mem.swapfree
      },
      temperature: temp.main ?? null,
      loadAverage: [load.avgLoad ?? 0],
      network: net.map(n => ({
        interface: n.iface,
        rxSec: Math.round(n.rx_sec ?? 0),
        txSec: Math.round(n.tx_sec ?? 0)
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/system/cpu
router.get('/cpu', async (req, res) => {
  try {
    const [info, load] = await Promise.all([si.cpu(), si.currentLoad()]);
    res.json({
      manufacturer: info.manufacturer,
      brand: info.brand,
      cores: info.cores,
      physicalCores: info.physicalCores,
      currentLoad: Math.round(load.currentLoad * 10) / 10,
      coresLoad: load.cpus.map(c => Math.round(c.load * 10) / 10)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/system/processes
router.get('/processes', async (req, res) => {
  try {
    const procs = await si.processes();
    const top = procs.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 10)
      .map(p => ({
        pid: p.pid,
        name: p.name,
        cpu: Math.round(p.cpu * 10) / 10,
        mem: Math.round(p.mem * 10) / 10,
        state: p.state
      }));

    res.json({ all: procs.all, running: procs.running, top });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/system/history
router.get('/history', (req, res) => {
  res.json(metricsHistory);
});

// GET /api/system/specs
router.get('/specs', async (req, res) => {
  try {
    const [cpu, mem, os, sys] = await Promise.all([
      si.cpu(), si.mem(), si.osInfo(), si.system()
    ]);
    res.json({
      cpu: {
        manufacturer:  cpu.manufacturer,
        brand:         cpu.brand,
        speed:         cpu.speed,
        cores:         cpu.cores,
        physicalCores: cpu.physicalCores
      },
      ram:    { total: mem.total },
      os:     { distro: os.distro, release: os.release, kernel: os.kernel, arch: os.arch, hostname: os.hostname },
      system: { manufacturer: sys.manufacturer, model: sys.model }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
