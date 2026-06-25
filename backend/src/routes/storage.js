const express = require('express');
const si = require('systeminformation');
const { exec } = require('child_process');
const { promisify } = require('util');
const router = express.Router();

const execAsync = promisify(exec);

// Filesystem virtuali da escludere
const VIRTUAL_FS_TYPES = new Set([
  'overlay', 'tmpfs', 'shm', 'proc', 'sysfs', 'devtmpfs', 'devpts',
  'cgroup', 'cgroup2', 'pstore', 'mqueue', 'hugetlbfs', 'debugfs',
  'tracefs', 'securityfs', 'fusectl', 'nsfs', 'ramfs', 'squashfs'
]);

const DOCKER_INTERNAL_PATHS = new Set([
  '/etc/hosts', '/etc/hostname', '/etc/resolv.conf',
  '/dev', '/dev/shm', '/run', '/sys', '/proc'
]);

function isRealFilesystem(fs) {
  if (VIRTUAL_FS_TYPES.has(fs.type)) return false;
  if (DOCKER_INTERNAL_PATHS.has(fs.mount)) return false;
  if (fs.size === 0) return false;
  if (/^\/(proc|sys|dev)/.test(fs.mount)) return false;
  return true;
}

// Appiattisce la struttura ad albero di lsblk ricorsivamente
function flattenDevices(devices, parentName = null) {
  const result = [];
  for (const d of (devices ?? [])) {
    if (d.type === 'loop') continue; // escludi loop device (snap, ecc.)

    result.push({
      name: d.name,
      path: `/dev/${d.name}`,
      size: parseInt(d.size) || 0,
      type: d.type,           // disk | part | rom | lvm
      fstype: d.fstype || null,
      mountpoint: d.mountpoint || null,
      label: d.label || null,
      vendor: (d.vendor ?? '').trim() || null,
      model: (d.model ?? '').trim() || null,
      parent: parentName,
      mounted: !!d.mountpoint
    });

    if (d.children?.length) {
      result.push(...flattenDevices(d.children, d.name));
    }
  }
  return result;
}

// GET /api/storage
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
        warning: fs.use > 85
      }));

    res.json({
      disks: disks.map(d => ({
        name: d.name,
        type: d.type,
        size: d.size,
        vendor: d.vendor,
        model: d.model
      })),
      filesystems
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/storage/devices — tutti i dispositivi a blocchi (inclusi non montati)
router.get('/devices', async (req, res) => {
  try {
    const { stdout } = await execAsync(
      'lsblk -J -b -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,LABEL,VENDOR,MODEL'
    );
    const data = JSON.parse(stdout);
    const devices = flattenDevices(data.blockdevices);
    res.json(devices);
  } catch (err) {
    // lsblk non disponibile (es. dev locale Windows)
    res.status(500).json({ error: `lsblk non disponibile: ${err.message}` });
  }
});

// POST /api/storage/remount — rimonta un dispositivo nel namespace host tramite nsenter
router.post('/remount', async (req, res) => {
  const { device } = req.body;

  if (!device) return res.status(400).json({ error: 'Campo "device" richiesto' });

  // Valida il path del device per evitare command injection
  if (!/^\/dev\/[a-zA-Z0-9]+$/.test(device)) {
    return res.status(400).json({ error: 'Path dispositivo non valido' });
  }

  try {
    // nsenter entra nel mount namespace del processo 1 (host init) e lancia mount
    // Funziona solo con privileged: true nel container
    const { stdout, stderr } = await execAsync(
      `nsenter --mount=/proc/1/ns/mnt -- mount ${device}`,
      { timeout: 10000 }
    );
    res.json({
      success: true,
      message: `${device} rimontato correttamente`,
      output: (stdout + stderr).trim()
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      hint: `Verifica che ${device} sia in /etc/fstab sul Raspberry`
    });
  }
});

// GET /api/storage/io
router.get('/io', async (req, res) => {
  try {
    const io = await si.disksIO();
    res.json({
      readSec: io.rIO_sec ?? 0,
      writeSec: io.wIO_sec ?? 0,
      readBytes: io.rBytesPerSec ?? 0,
      writeBytes: io.wBytesPerSec ?? 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
