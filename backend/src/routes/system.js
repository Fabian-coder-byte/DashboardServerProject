'use strict';

const express    = require('express');
const si         = require('systeminformation');
const { readHostOsRelease, readHostHostname, readHostModel, nsenterExec } = require('../helpers/host');
const log        = require('../logger');

const router = express.Router();

// ── Soglie di allerta ─────────────────────────────────────────────────────────
const THRESHOLDS = {
  cpu:  { warning: 80,  error: 95  },
  temp: { warning: 70,  error: 82  },
  ram:  { warning: 80,  error: 90  },
  swap: { warning: 50,  error: 80  },
  disk: { warning: 85,  error: 92  },
};

// ── Ring buffer metriche storiche (max 10 min a campioni da 10 s) ─────────────
const HISTORY_MAX = 60;
const metricsHistory = [];

async function collectSample() {
  try {
    const [load, mem, temp, net] = await Promise.all([
      si.currentLoad(), si.mem(), si.cpuTemperature(), si.networkStats(),
    ]);
    metricsHistory.push({
      t:     Math.floor(Date.now() / 1000),
      cpu:   Math.round(load.currentLoad * 10) / 10,
      ram:   Math.round(((mem.total - mem.available) / mem.total) * 100),
      temp:  temp.main != null ? Math.round(temp.main * 10) / 10 : null,
      netRx: Math.round(net.reduce((s, n) => s + (n.rx_sec ?? 0), 0)),
      netTx: Math.round(net.reduce((s, n) => s + (n.tx_sec ?? 0), 0)),
    });
    if (metricsHistory.length > HISTORY_MAX) metricsHistory.shift();
  } catch (err) {
    log.warn('system', 'raccolta metriche storiche fallita', err);
  }
}

collectSample();
setInterval(collectSample, 10000);

// ── Helper: throttling vcgencmd ───────────────────────────────────────────────
// Solo su Raspberry Pi — ritorna null su altri sistemi senza errori
async function getThrottling() {
  const out = await nsenterExec('-t 1 -m', 'vcgencmd get_throttled', 4000);
  if (!out) return null;
  const m = out.match(/throttled=0x([0-9a-fA-F]+)/);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return {
    raw:                      `0x${m[1]}`,
    underVoltage:             !!(v & 0x00001),
    frequencyCapped:          !!(v & 0x00002),
    currentlyThrottled:       !!(v & 0x00004),
    softTempLimit:            !!(v & 0x00008),
    underVoltageOccurred:     !!(v & 0x10000),
    frequencyCappedOccurred:  !!(v & 0x20000),
    throttlingOccurred:       !!(v & 0x40000),
    softTempLimitOccurred:    !!(v & 0x80000),
  };
}

// ── Helper: check soglia ──────────────────────────────────────────────────────
function checkLevel(value, warn, err) {
  if (value == null) return 'unknown';
  if (value >= err)  return 'error';
  if (value >= warn) return 'warning';
  return 'ok';
}

// ── GET /api/system/overview ──────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const [load, mem, temp, osInfo, time, net] = await Promise.all([
      si.currentLoad(), si.mem(), si.cpuTemperature(), si.osInfo(), si.time(), si.networkStats(),
    ]);

    const hostOs       = readHostOsRelease();
    const hostHostname = readHostHostname();
    const ramUsed      = mem.total - mem.available;

    res.json({
      hostname:    hostHostname || osInfo.hostname,
      platform:    'linux',
      distro:      hostOs?.distro   || osInfo.distro,
      release:     hostOs?.release  || osInfo.release,
      kernel:      osInfo.kernel,
      arch:        osInfo.arch,
      uptime:      time.uptime,
      localTime:   new Date().toISOString(),
      cpuUsage:    Math.round(load.currentLoad * 10) / 10,
      loadAverage: [load.avgLoad ?? 0],
      ram: {
        total:       mem.total,
        used:        ramUsed,
        free:        mem.free,
        available:   mem.available,
        active:      mem.active,
        buffcache:   mem.buffcache,
        usedPercent: Math.round((ramUsed / mem.total) * 100),
      },
      swap: {
        total:       mem.swaptotal,
        used:        mem.swapused,
        free:        mem.swapfree,
        usedPercent: mem.swaptotal > 0 ? Math.round((mem.swapused / mem.swaptotal) * 100) : 0,
      },
      temperature: temp.main ?? null,
      network:     net.map(n => ({
        interface: n.iface,
        rxSec:     Math.round(n.rx_sec ?? 0),
        txSec:     Math.round(n.tx_sec ?? 0),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/system/cpu ───────────────────────────────────────────────────────
// Aggiunto: temperatura per core, throttling vcgencmd, frequenza corrente
router.get('/cpu', async (req, res) => {
  try {
    const [info, load, temp, throttling] = await Promise.all([
      si.cpu(), si.currentLoad(), si.cpuTemperature(), getThrottling(),
    ]);

    res.json({
      manufacturer:  info.manufacturer,
      brand:         info.brand,
      cores:         info.cores,
      physicalCores: info.physicalCores,
      speedGHz:      info.speed,
      currentLoad:   Math.round(load.currentLoad * 10) / 10,
      coresLoad:     load.cpus.map(c => Math.round(c.load * 10) / 10),
      temperature: {
        main:   temp.main  ?? null,
        cores:  (temp.cores ?? []).map(t => (t != null ? Math.round(t * 10) / 10 : null)),
        socket: (temp.socket ?? []).map(t => (t != null ? Math.round(t * 10) / 10 : null)),
        max:    temp.max   ?? null,
      },
      throttling,   // null su sistemi non-Raspberry
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/system/memory ────────────────────────────────────────────────────
// Endpoint dedicato RAM/swap + top processi per uso memoria
router.get('/memory', async (req, res) => {
  try {
    const [mem, procs] = await Promise.all([si.mem(), si.processes()]);

    const ramUsed      = mem.total - mem.available;
    const usedPercent  = Math.round((ramUsed / mem.total) * 100);
    const swapPercent  = mem.swaptotal > 0 ? Math.round((mem.swapused / mem.swaptotal) * 100) : 0;

    const topByMem = procs.list
      .sort((a, b) => b.mem - a.mem)
      .slice(0, 10)
      .map(p => ({
        pid:   p.pid,
        name:  p.name,
        cpu:   Math.round(p.cpu  * 10) / 10,
        mem:   Math.round(p.mem  * 10) / 10,
        state: p.state,
      }));

    res.json({
      total:       mem.total,
      used:        ramUsed,
      free:        mem.free,
      available:   mem.available,
      active:      mem.active,
      buffcache:   mem.buffcache,
      usedPercent,
      swap: {
        total:       mem.swaptotal,
        used:        mem.swapused,
        free:        mem.swapfree,
        usedPercent: swapPercent,
      },
      topByMem,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/system/processes ─────────────────────────────────────────────────
router.get('/processes', async (req, res) => {
  try {
    const procs = await si.processes();
    const top = procs.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 10)
      .map(p => ({ pid: p.pid, name: p.name, cpu: Math.round(p.cpu * 10) / 10, mem: Math.round(p.mem * 10) / 10, state: p.state }));

    res.json({ all: procs.all, running: procs.running, top });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/system/history ───────────────────────────────────────────────────
router.get('/history', (_req, res) => res.json(metricsHistory));

// ── GET /api/system/specs ─────────────────────────────────────────────────────
router.get('/specs', async (req, res) => {
  try {
    const [cpu, mem, os, sys] = await Promise.all([si.cpu(), si.mem(), si.osInfo(), si.system()]);

    const hostOs       = readHostOsRelease();
    const hostHostname = readHostHostname();
    const hostModel    = readHostModel() || sys.model || '';
    const manufacturer = sys.manufacturer
      || (hostModel.toLowerCase().includes('raspberry') ? 'Raspberry Pi Foundation' : '');

    res.json({
      cpu: {
        manufacturer: cpu.manufacturer,
        brand:        cpu.brand,
        speed:        cpu.speed,
        cores:        cpu.cores,
        physicalCores: cpu.physicalCores,
      },
      ram:    { total: mem.total },
      os: {
        distro:   hostOs?.distro   || os.distro,
        release:  hostOs?.release  || os.release,
        codename: hostOs?.codename || '',
        kernel:   os.kernel,
        arch:     os.arch,
        hostname: hostHostname || os.hostname,
      },
      system: { manufacturer, model: hostModel },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/system/health ────────────────────────────────────────────────────
// Riepilogo globale dello stato del sistema con soglie
router.get('/health', async (req, res) => {
  try {
    const [load, mem, temp, fsStats, throttling] = await Promise.all([
      si.currentLoad(), si.mem(), si.cpuTemperature(), si.fsSize(), getThrottling(),
    ]);

    const ramUsed    = mem.total - mem.available;
    const ramPct     = Math.round((ramUsed / mem.total) * 100);
    const swapPct    = mem.swaptotal > 0 ? Math.round((mem.swapused / mem.swaptotal) * 100) : 0;
    const cpuPct     = Math.round(load.currentLoad * 10) / 10;
    const tempVal    = temp.main ?? null;

    const diskChecks = fsStats
      .filter(f => f.size > 0 && !['overlay', 'tmpfs', 'proc', 'sysfs'].includes(f.type))
      .map(f => ({
        mount:  f.mount,
        usedPct: Math.round(f.use * 10) / 10,
        status:  checkLevel(f.use, THRESHOLDS.disk.warning, THRESHOLDS.disk.error),
      }));

    const checks = {
      cpu:         { value: cpuPct,  status: checkLevel(cpuPct,  THRESHOLDS.cpu.warning,  THRESHOLDS.cpu.error),  thresholds: THRESHOLDS.cpu  },
      temperature: { value: tempVal, status: checkLevel(tempVal, THRESHOLDS.temp.warning, THRESHOLDS.temp.error), thresholds: THRESHOLDS.temp },
      ram:         { value: ramPct,  status: checkLevel(ramPct,  THRESHOLDS.ram.warning,  THRESHOLDS.ram.error),  thresholds: THRESHOLDS.ram  },
      swap:        { value: swapPct, status: checkLevel(swapPct, THRESHOLDS.swap.warning, THRESHOLDS.swap.error), thresholds: THRESHOLDS.swap },
      disks:       diskChecks,
      throttling:  throttling
        ? {
            status: (throttling.currentlyThrottled || throttling.underVoltage) ? 'error'
                  : (throttling.throttlingOccurred || throttling.underVoltageOccurred) ? 'warning'
                  : 'ok',
            ...throttling,
          }
        : { status: 'unknown' },
    };

    const allStatuses = [
      checks.cpu.status, checks.temperature.status, checks.ram.status,
      checks.swap.status, checks.throttling.status,
      ...diskChecks.map(d => d.status),
    ];

    const overallStatus = allStatuses.includes('error')   ? 'error'
                        : allStatuses.includes('warning') ? 'warning'
                        : 'ok';

    res.json({ status: overallStatus, timestamp: new Date().toISOString(), checks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/system/journal ───────────────────────────────────────────────────
// Errori recenti da journalctl + verifica se il sistema richiede riavvio
router.get('/journal', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);

  const [journalRaw, rebootRaw] = await Promise.all([
    // -p 3 = error e superiori, -n limit, -o short-iso per timestamp leggibile
    nsenterExec('-t 1 -m', `journalctl -p 3 -n ${limit} --no-pager -o short-iso`, 8000),
    // Controlla file creato da unattended-upgrades / apt
    nsenterExec('-t 1 -m', 'test -f /var/run/reboot-required && echo yes || echo no', 4000),
  ]);

  const errors = (journalRaw || '').split('\n')
    .filter(l => l.trim() && !l.startsWith('-- '))
    .slice(-limit)
    .map(line => {
      // Formato: "2026-06-30T12:00:00+0200 hostname unit[pid]: message"
      const m = line.match(/^(\S+)\s+\S+\s+(\S+?)(?:\[\d+\])?:\s+(.+)$/);
      return m
        ? { timestamp: m[1], unit: m[2], message: m[3].slice(0, 200) }
        : { timestamp: null, unit: null, message: line.slice(0, 200) };
    });

  res.json({
    rebootRequired: rebootRaw === 'yes',
    errors,
    source: journalRaw ? 'journalctl' : 'unavailable',
  });
});

// ── POST /api/system/control ──────────────────────────────────────────────────
router.post('/control', async (req, res) => {
  const { action } = req.body;
  const { execAsync: _exec } = (() => {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    return { execAsync: promisify(exec) };
  })();

  if (action === 'check-updates') {
    try {
      await nsenterExec('-t 1 -m', 'apt-get update -qq', 90000).catch(() => {});
      const out = await nsenterExec('-t 1 -m', 'apt list --upgradable 2>/dev/null', 30000);
      const updates = (out || '').split('\n')
        .filter(l => l.includes('/') && !l.startsWith('Listing') && !l.startsWith('WARNING'))
        .map(l => l.split('/')[0].trim())
        .filter(Boolean);
      return res.json({ updates, count: updates.length });
    } catch (err) {
      return res.status(500).json({ error: `Errore aggiornamenti: ${err.message}` });
    }
  }

  if (action === 'reboot' || action === 'poweroff') {
    res.json({
      success: true,
      message: action === 'reboot'
        ? 'Riavvio in corso... La dashboard tornerà tra 30-60 secondi.'
        : 'Spegnimento in corso. Riaccendi fisicamente il Raspberry Pi.',
    });
    const cmd = action === 'reboot'
      ? 'nsenter -t 1 -m -- systemctl reboot'
      : 'nsenter -t 1 -m -- systemctl poweroff';
    setTimeout(() => {
      log.info('system', `esecuzione ${action}`);
      require('child_process').exec(cmd, err => {
        if (err) log.error('system', `${action} fallito`, err);
      });
    }, 800);
    return;
  }

  res.status(400).json({ error: 'Azione non valida. Usa: reboot, poweroff, check-updates' });
});

module.exports = router;
