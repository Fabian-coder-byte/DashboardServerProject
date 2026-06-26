const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const log = require('../logger');

const router = express.Router();
const execAsync = promisify(exec);

function readHostname() {
  try { return fs.readFileSync('/host/hostname', 'utf8').trim(); } catch (_) { return null; }
}

// Parse `ip -4 addr` output into [{name, ip4}]
function parseIpAddr(stdout) {
  const ifaces = [];
  let cur = null;
  for (const line of stdout.split('\n')) {
    const m = line.match(/^\d+:\s+([^:@\s]+)/);
    if (m) { cur = { name: m[1], ip4: null }; ifaces.push(cur); }
    else if (cur) {
      const ip = line.match(/\binet\s+([\d.]+)\/\d+/);
      if (ip) cur.ip4 = ip[1];
    }
  }
  return ifaces.filter(i => i.ip4);
}

async function getHostIfaces() {
  try {
    const { stdout } = await execAsync('nsenter -t 1 -n -- ip -4 addr 2>/dev/null', { timeout: 5000 });
    return parseIpAddr(stdout);
  } catch (err) {
    log.warn('network', 'impossibile leggere interfacce host via nsenter', err);
    return [];
  }
}

async function getTailscaleInfo() {
  try {
    const { stdout } = await execAsync(
      'nsenter -t 1 -n -- ip -4 addr show ts0 2>/dev/null || nsenter -t 1 -n -- ip -4 addr show tailscale0 2>/dev/null || true',
      { timeout: 5000 }
    );

    const parsed = parseIpAddr(stdout);
    const ts = parsed.find(i => i.name === 'ts0' || i.name === 'tailscale0');

    if (!ts) return { online: false, ip: null, hostname: null };

    let hostname = null;
    try {
      const { stdout: tsOut } = await execAsync(
        'nsenter -t 1 -m -- tailscale status --json 2>/dev/null',
        { timeout: 5000 }
      );
      if (tsOut.trim()) {
        const data = JSON.parse(tsOut);
        hostname = data.Self?.DNSName?.replace(/\.$/, '') ?? null;
      }
    } catch (err) { log.warn('network', 'tailscale status --json fallito', err); }

    return { online: true, ip: ts.ip4, hostname };
  } catch (err) {
    log.warn('network', 'controllo interfaccia Tailscale fallito', err);
    return { online: false, ip: null, hostname: null };
  }
}

// GET /api/network
router.get('/', async (req, res) => {
  try {
    const [allIfaces, tailscale] = await Promise.all([getHostIfaces(), getTailscaleInfo()]);

    const realIfaces = allIfaces.filter(i =>
      i.name !== 'lo' &&
      !i.name.startsWith('docker') &&
      !i.name.startsWith('br-') &&
      !i.name.startsWith('veth') &&
      i.name !== 'ts0' &&
      i.name !== 'tailscale0'
    );

    res.json({
      hostname: readHostname(),
      localIp: realIfaces[0]?.ip4 ?? null,
      interfaces: realIfaces,
      tailscale
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
