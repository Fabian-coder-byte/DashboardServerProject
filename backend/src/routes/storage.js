'use strict';

const express = require('express');
const si = require('systeminformation');
const { nsenterExec } = require('../helpers/host');
const { exec } = require('child_process');
const { promisify } = require('util');
const router = express.Router();
const { getStorageUsage } = require('../services/storageUsage');

const execAsync = promisify(exec);

// Path critici: se non montati vanno in alert
const CRITICAL_MOUNTS = ['/mnt/storage1'];

// Filesystem virtuali da escludere dalla lista
const VIRTUAL_FS = new Set([
  'overlay', 'tmpfs', 'shm', 'proc', 'sysfs', 'devtmpfs', 'devpts',
  'cgroup', 'cgroup2', 'pstore', 'mqueue', 'hugetlbfs', 'debugfs',
  'tracefs', 'securityfs', 'fusectl', 'nsfs', 'ramfs', 'squashfs',
]);

const DOCKER_PATHS = new Set([
  '/etc/hosts', '/etc/hostname', '/etc/resolv.conf',
  '/dev', '/dev/shm', '/run', '/sys', '/proc',
]);

function isRealFilesystem(fs) {
  if (VIRTUAL_FS.has(fs.type)) return false;
  if (DOCKER_PATHS.has(fs.mount)) return false;
  if (fs.size === 0) return false;
  if (/^\/(proc|sys|dev)/.test(fs.mount)) return false;
  return true;
}

// Appiattisce la struttura ad albero di lsblk ricorsivamente
function flattenDevices(devices, parentName = null) {
  const result = [];
  for (const d of (devices ?? [])) {
    if (d.type === 'loop') continue;

    const mountpoint = d.mountpoint
      || (Array.isArray(d.mountpoints) ? d.mountpoints.find(m => m) : null)
      || null;

    result.push({
      name: d.name, path: `/dev/${d.name}`,
      size: parseInt(d.size) || 0,
      type: d.type, fstype: d.fstype || null,
      mountpoint, label: d.label || null,
      vendor: (d.vendor ?? '').trim() || null,
      model: (d.model ?? '').trim() || null,
      parent: parentName, mounted: !!mountpoint,
    });

    if (d.children?.length) result.push(...flattenDevices(d.children, d.name));
  }
  return result;
}

// ── Helper: controlla se un path è montato ────────────────────────────────────
async function isMounted(mountPath) {
  const out = await nsenterExec('-t 1 -m', `mountpoint -q ${mountPath} && echo yes || echo no`, 5000);
  return out === 'yes';
}

// ── Helper: temperatura disco via smartctl ────────────────────────────────────
async function getSmartTemperature(device) {
  const out = await nsenterExec('-t 1 -m', `smartctl -A ${device} 2>/dev/null`, 8000);
  if (!out) return null;
  // Cerca "190 Airflow_Temperature_Cel" o "194 Temperature_Celsius"
  const m = out.match(/(?:19[04])\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(\d+)/);
  return m ? parseInt(m[1]) : null;
}

// ── GET /api/storage ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [disks, fsStats] = await Promise.all([si.diskLayout(), si.fsSize()]);

    const filesystems = fsStats
      .filter(isRealFilesystem)
      .map(fs => ({
        mount: fs.mount,
        filesystem: fs.fs,
        type: fs.type,
        total: fs.size,
        used: fs.used,
        free: fs.size - fs.used,
        usedPercent: Math.round(fs.use * 10) / 10,
        mounted: true,
        warning: fs.use > 85,
        critical: CRITICAL_MOUNTS.includes(fs.mount),
      }));

    // Verifica i mount critici: segnala quelli non presenti nella lista
    const mountedPaths = new Set(filesystems.map(f => f.mount));
    const criticalChecks = await Promise.all(
      CRITICAL_MOUNTS.map(async path => ({
        path,
        mounted: mountedPaths.has(path) || await isMounted(path),
      }))
    );

    res.json({
      disks: disks.map(d => ({
        name: d.name,
        type: d.type,
        size: d.size,
        vendor: d.vendor,
        model: d.model,
      })),
      filesystems,
      criticalMounts: criticalChecks,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/storage/usage — spazio per area/servizio con cache 5 min
router.get('/usage', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  try {
    const data = await getStorageUsage(forceRefresh);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/storage/devices — tutti i dispositivi a blocchi (inclusi non montati)
router.get('/devices', async (req, res) => {
  try {
    const { stdout } = await execAsync(
      'lsblk -J -b -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MOUNTPOINTS,LABEL,VENDOR,MODEL 2>/dev/null || lsblk -J -b -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,LABEL,VENDOR,MODEL'
    );
    const data = JSON.parse(stdout);
    const devices = flattenDevices(data.blockdevices);
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: `lsblk non disponibile: ${err.message}` });
  }
});

// ── POST /api/storage/remount ─────────────────────────────────────────────────
router.post('/remount', async (req, res) => {
  const { device } = req.body;
  if (!device) return res.status(400).json({ error: 'Campo "device" richiesto' });
  if (!/^\/dev\/[a-zA-Z0-9]+$/.test(device))
    return res.status(400).json({ error: 'Path dispositivo non valido' });

  try {
    const { stdout, stderr } = await execAsync(
      `nsenter --mount=/proc/1/ns/mnt -- mount ${device}`,
      { timeout: 10000 }
    );
    res.json({ success: true, message: `${device} rimontato correttamente`, output: (stdout + stderr).trim() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, hint: `Verifica che ${device} sia in /etc/fstab sul Raspberry` });
  }
});

// ── GET /api/storage/io ───────────────────────────────────────────────────────
router.get('/io', async (req, res) => {
  try {
    const io = await si.disksIO();
    res.json({
      readSec: io.rIO_sec ?? 0,
      writeSec: io.wIO_sec ?? 0,
      readBytes: io.rBytesPerSec ?? 0,
      writeBytes: io.wBytesPerSec ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/storage/smart ────────────────────────────────────────────────────
// Legge dati SMART per i dischi (richiede smartmontools sul Raspberry + privileged)
// Ritorna risultati parziali se solo alcuni dischi supportano SMART
router.get('/smart', async (req, res) => {
  try {
    const { stdout } = await execAsync(
      'lsblk -J -b -o NAME,TYPE 2>/dev/null',
      { timeout: 5000 }
    );
    const data = JSON.parse(stdout);
    const disks = (data.blockdevices || [])
      .filter(d => d.type === 'disk')
      .map(d => `/dev/${d.name}`);

    const results = await Promise.allSettled(disks.map(async device => {
      const out = await nsenterExec('-t 1 -m', `smartctl -i -A -H ${device}`, 10000);
      if (!out) return { device, available: false };

      // Estrai temperatura
      const tempMatch = out.match(/(?:19[04])\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(\d+)/);
      const temp = tempMatch ? parseInt(tempMatch[1]) : null;

      // Estrai stato SMART overall
      const healthMatch = out.match(/SMART overall-health self-assessment test result: (\w+)/);
      const health = healthMatch ? healthMatch[1] : null;

      // Estrai ore di accensione
      const hoursMatch = out.match(/Power_On_Hours\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(\d+)/);
      const powerOnHours = hoursMatch ? parseInt(hoursMatch[1]) : null;

      // Estrai reallocated sectors
      const reallocMatch = out.match(/Reallocated_Sector_Ct\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(\d+)/);
      const reallocatedSectors = reallocMatch ? parseInt(reallocMatch[1]) : null;

      return { device, available: true, health, temperatureC: temp, powerOnHours, reallocatedSectors };
    }));

    const smart = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    res.json({ disks: smart, smartAvailable: smart.some(d => d.available) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
