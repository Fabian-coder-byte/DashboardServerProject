const express = require('express');
const si = require('systeminformation');
const router = express.Router();

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

module.exports = router;
