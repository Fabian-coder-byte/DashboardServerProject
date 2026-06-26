const express = require('express');
const si = require('systeminformation');
const fs = require('fs');
const router = express.Router();

// ── Lettura info OS dall'host (montato come /host/os-release) ────────────────
// Quando il backend gira in Docker (Alpine), questi file danno i dati reali del Raspberry
function readHostOsRelease() {
  try {
    const raw = fs.readFileSync('/host/os-release', 'utf8');
    const map = {};
    raw.split('\n').forEach(line => {
      const eq = line.indexOf('=');
      if (eq > 0) {
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        map[key] = val;
      }
    });
    return {
      distro:   map['NAME']             || map['ID']      || null,
      release:  map['VERSION_ID']       || null,
      codename: map['VERSION_CODENAME'] || null,
      id:       map['ID']               || null,
    };
  } catch (_) { return null; }
}

function readHostHostname() {
  try { return fs.readFileSync('/host/hostname', 'utf8').trim(); } catch (_) { return null; }
}

// Legge il modello hardware dal device-tree del Raspberry Pi (stringa con null byte finale)
function readHostModel() {
  try {
    const buf = fs.readFileSync('/host/device-tree/model');
    return buf.toString('utf8').replace(/\0/g, '').trim();
  } catch (_) { return null; }
}

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

    // Preferisce i dati dell'host montati; se mancano usa quelli del container come fallback
    const hostOs       = readHostOsRelease();
    const hostHostname = readHostHostname();

    res.json({
      hostname: hostHostname || osInfo.hostname,
      platform: 'linux',
      distro:   hostOs?.distro   || osInfo.distro,
      release:  hostOs?.release  || osInfo.release,
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

    const hostOs       = readHostOsRelease();
    const hostHostname = readHostHostname();
    // Modello hardware: device-tree (Raspberry Pi) > systeminformation > fallback
    const hostModel    = readHostModel() || sys.model || '';
    // Produttore: inferito dal modello se non disponibile
    const manufacturer = sys.manufacturer || (hostModel.toLowerCase().includes('raspberry') ? 'Raspberry Pi Foundation' : '');

    res.json({
      cpu: {
        manufacturer:  cpu.manufacturer,
        brand:         cpu.brand,
        speed:         cpu.speed,
        cores:         cpu.cores,
        physicalCores: cpu.physicalCores
      },
      ram: { total: mem.total },
      os: {
        distro:   hostOs?.distro   || os.distro,
        release:  hostOs?.release  || os.release,
        codename: hostOs?.codename || '',
        kernel:   os.kernel,   // corretto: viene dal kernel host condiviso
        arch:     os.arch,     // corretto: architettura reale
        hostname: hostHostname || os.hostname
      },
      system: { manufacturer, model: hostModel }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
