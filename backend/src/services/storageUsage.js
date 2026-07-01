const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const si = require('systeminformation');
const log = require('../logger');

const execFileAsync = promisify(execFile);

const STORAGE_MOUNT = process.env.STORAGE_MOUNT || '/mnt/storage1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const STORAGE_AREAS = [
  { key: 'movies',        label: 'Film',          service: 'Jellyfin',    path: `${STORAGE_MOUNT}/media/movies`,             icon: 'film' },
  { key: 'tvShows',       label: 'Serie TV',       service: 'Jellyfin',    path: `${STORAGE_MOUNT}/media/tv-shows`,           icon: 'tv' },
  { key: 'cartoonMovies', label: 'Film Animati',   service: 'Jellyfin',    path: `${STORAGE_MOUNT}/media/cartoon-movies`,     icon: 'play-circle-fill' },
  { key: 'cartoonShows',  label: 'Cartoni',        service: 'Jellyfin',    path: `${STORAGE_MOUNT}/media/cartoon-shows`,      icon: 'play-circle-fill' },
  { key: 'documentaries', label: 'Documentari',    service: 'Jellyfin',    path: `${STORAGE_MOUNT}/media/documentary-movies`, icon: 'camera-video-fill' },
  { key: 'photos',        label: 'Foto e Video',   service: 'Immich',      path: `${STORAGE_MOUNT}/photos`,                   icon: 'images' },
  { key: 'documents',     label: 'Documenti',      service: 'Nextcloud',   path: `${STORAGE_MOUNT}/docs`,                     icon: 'folder-fill' },
  { key: 'books',         label: 'Libri',          service: 'Calibre',     path: `${STORAGE_MOUNT}/books`,                    icon: 'book-fill' },
  { key: 'comics',        label: 'Fumetti',        service: 'Kavita',      path: `${STORAGE_MOUNT}/comics`,                   icon: 'journals' },
  { key: 'downloads',     label: 'Download',       service: 'qBittorrent', path: `${STORAGE_MOUNT}/downloads`,                icon: 'download' },
  { key: 'backups',       label: 'Backup',         service: 'Backup',      path: `${STORAGE_MOUNT}/backups`,                  icon: 'cloud-arrow-up-fill' },
];

let _cache = null;
let _cacheTime = 0;

function fmtBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const s = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${s[i]}`;
}

async function dirExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

// Uses du -sb (bytes, summarize). Works on GNU coreutils / Raspberry Pi Debian.
async function getDirectorySizeBytes(dirPath) {
  try {
    const { stdout } = await execFileAsync('du', ['-sb', dirPath], { timeout: 60000 });
    const n = parseInt(stdout.trim().split(/\s+/)[0], 10);
    return isNaN(n) ? 0 : n;
  } catch (err) {
    log.warn('storageUsage', `du failed for ${dirPath}: ${err.message}`);
    return 0;
  }
}

// Counts only immediate children (depth 1) for performance on large directories.
async function countImmediateChildren(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return {
      files:   entries.filter(e => e.isFile()).length,
      folders: entries.filter(e => e.isDirectory()).length,
    };
  } catch {
    return { files: 0, folders: 0 };
  }
}

async function findDiskFs(mount) {
  const fsStats = await si.fsSize();
  const exact = fsStats.find(f => f.mount === mount);
  if (exact) return exact;
  // Fallback: longest matching parent mount
  return fsStats
    .filter(f => mount.startsWith(f.mount) && f.size > 0)
    .sort((a, b) => b.mount.length - a.mount.length)[0] ?? null;
}

async function computeUsage() {
  const diskFs = await findDiskFs(STORAGE_MOUNT);

  const disk = diskFs
    ? {
        mount:       STORAGE_MOUNT,
        totalBytes:  diskFs.size,
        usedBytes:   diskFs.used,
        freeBytes:   diskFs.size - diskFs.used,
        usedPercent: Math.round(diskFs.use * 10) / 10,
        available:   true,
      }
    : {
        mount:       STORAGE_MOUNT,
        totalBytes:  0,
        usedBytes:   0,
        freeBytes:   0,
        usedPercent: 0,
        available:   false,
      };

  // All directory scans in parallel; individual failures return 0 so others succeed.
  const areas = await Promise.all(
    STORAGE_AREAS.map(async (area) => {
      const exists = await dirExists(area.path);
      if (!exists) {
        return {
          key: area.key, label: area.label, service: area.service,
          path: area.path, icon: area.icon,
          exists: false, sizeBytes: 0, sizeFormatted: '0 B',
          percentOfDisk: 0, fileCount: 0, folderCount: 0,
        };
      }
      const [sizeBytes, counts] = await Promise.all([
        getDirectorySizeBytes(area.path),
        countImmediateChildren(area.path),
      ]);
      return {
        key: area.key, label: area.label, service: area.service,
        path: area.path, icon: area.icon,
        exists: true,
        sizeBytes,
        sizeFormatted: fmtBytes(sizeBytes),
        percentOfDisk: disk.totalBytes > 0
          ? Math.round((sizeBytes / disk.totalBytes) * 1000) / 10
          : 0,
        fileCount:  counts.files,
        folderCount: counts.folders,
      };
    })
  );

  areas.sort((a, b) => b.sizeBytes - a.sizeBytes);

  const knownAreasBytes = areas.reduce((s, a) => s + a.sizeBytes, 0);
  const otherBytes      = Math.max(0, disk.usedBytes - knownAreasBytes);

  return {
    disk,
    areas,
    summary: {
      knownAreasBytes,
      knownAreasFormatted: fmtBytes(knownAreasBytes),
      otherBytes,
      otherFormatted: fmtBytes(otherBytes),
      largestArea: areas.find(a => a.exists)?.label ?? null,
      lastUpdated: new Date().toISOString(),
    },
  };
}

async function getStorageUsage(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _cache && (now - _cacheTime) < CACHE_TTL_MS) {
    return { ..._cache, cached: true };
  }
  const data = await computeUsage();
  _cache     = data;
  _cacheTime = now;
  return { ...data, cached: false };
}

module.exports = { getStorageUsage };
