'use strict';

const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// ── Lettori file host ─────────────────────────────────────────────────────────

function readHostFile(hostPath, encoding = 'utf8') {
  try { return fs.readFileSync(hostPath, encoding); } catch { return null; }
}

function readHostOsRelease() {
  const raw = readHostFile('/host/os-release');
  if (!raw) return null;
  const map = {};
  raw.split('\n').forEach(line => {
    const eq = line.indexOf('=');
    if (eq > 0)
      map[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  });
  return {
    distro:   map['NAME'] || map['ID'] || null,
    release:  map['VERSION_ID'] || null,
    codename: map['VERSION_CODENAME'] || null,
    id:       map['ID'] || null,
  };
}

function readHostHostname() {
  return readHostFile('/host/hostname')?.trim() ?? null;
}

// Legge il modello hardware dal device-tree del Raspberry Pi (file con null byte finale)
function readHostModel() {
  try {
    return fs.readFileSync('/host/device-tree/model').toString('utf8').replace(/\0/g, '').trim();
  } catch { return null; }
}

// ── Shell helpers ─────────────────────────────────────────────────────────────

// Esegue cmd con timeout — restituisce stdout trimmed oppure null (mai lancia eccezione)
async function tryExec(cmd, timeoutMs = 5000) {
  try {
    const { stdout } = await execAsync(cmd, { timeout: timeoutMs });
    return stdout.trim();
  } catch { return null; }
}

// Esegue cmd nel namespace host tramite nsenter — restituisce stdout o null
// nsFlags esempio: '-t 1 -m' (mount ns), '-t 1 -n' (network ns), '-t 1 -m -n' (entrambi)
async function nsenterExec(nsFlags, cmd, timeoutMs = 5000) {
  return tryExec(`nsenter ${nsFlags} -- ${cmd} 2>/dev/null`, timeoutMs);
}

module.exports = {
  readHostFile,
  readHostOsRelease,
  readHostHostname,
  readHostModel,
  tryExec,
  nsenterExec,
};
