'use strict';

const express = require('express');
const si      = require('systeminformation');
const { readHostFile, readHostHostname, nsenterExec } = require('../helpers/host');
const log     = require('../logger');

const router = express.Router();

// ── Helper: parse output di `ip -4 addr` ─────────────────────────────────────
function parseIpAddr(stdout) {
  const ifaces = [];
  let cur = null;
  for (const line of (stdout || '').split('\n')) {
    const m = line.match(/^\d+:\s+([^:@\s]+)/);
    if (m) { cur = { name: m[1], ip4: null }; ifaces.push(cur); }
    else if (cur) {
      const ip = line.match(/\binet\s+([\d.]+)\/\d+/);
      if (ip) cur.ip4 = ip[1];
    }
  }
  return ifaces.filter(i => i.ip4);
}

// ── Helper: interfacce reali dell'host (esclude Docker/loopback) ──────────────
async function getHostIfaces() {
  const out = await nsenterExec('-t 1 -n', 'ip -4 addr', 5000);
  if (!out) return [];
  return parseIpAddr(out).filter(i =>
    i.name !== 'lo' &&
    !i.name.startsWith('docker') &&
    !i.name.startsWith('br-') &&
    !i.name.startsWith('veth') &&
    i.name !== 'ts0' &&
    i.name !== 'tailscale0'
  );
}

// ── Helper: gateway default ───────────────────────────────────────────────────
async function getGateway() {
  const out = await nsenterExec('-t 1 -n', 'ip route show default', 4000);
  const m = (out || '').match(/default via ([\d.]+)/);
  return m ? m[1] : null;
}

// ── Helper: server DNS dall'host ──────────────────────────────────────────────
async function getDns() {
  // Prova prima il file montato, poi via nsenter
  const raw = readHostFile('/host/resolv.conf')
    || await nsenterExec('-t 1 -m', 'cat /etc/resolv.conf', 3000);
  if (!raw) return [];
  return raw.split('\n')
    .filter(l => l.startsWith('nameserver'))
    .map(l => l.replace('nameserver', '').trim())
    .filter(Boolean);
}

// ── Helper: velocità link interfaccia ────────────────────────────────────────
async function getLinkSpeed(iface) {
  const out = await nsenterExec('-t 1 -n', `cat /sys/class/net/${iface}/speed`, 3000);
  if (!out) return null;
  const speed = parseInt(out);
  return !isNaN(speed) && speed > 0 ? speed : null;  // Mbps
}

// ── Helper: porte TCP aperte sul sistema host ─────────────────────────────────
async function getOpenPorts() {
  const out = await nsenterExec('-t 1 -n', 'ss -tlnp4', 5000);
  if (!out) return [];

  const ports = [];
  const seen  = new Set();

  out.split('\n').forEach(line => {
    if (!line.startsWith('LISTEN')) return;
    const parts   = line.split(/\s+/);
    const addr    = parts[3] || '';
    const portStr = addr.split(':').pop();
    const port    = parseInt(portStr);
    if (!port || isNaN(port) || seen.has(port)) return;

    const procMatch = line.match(/users:\(\("([^"]+)"/);
    seen.add(port);
    ports.push({
      port,
      proto:   'tcp',
      process: procMatch ? procMatch[1] : null,
    });
  });

  return ports.sort((a, b) => a.port - b.port);
}

// ── Helper: ping verso un host ────────────────────────────────────────────────
async function pingHost(target) {
  const out = await nsenterExec('-t 1 -n', `ping -c 2 -W 2 -q ${target}`, 8000);
  if (!out || !out.includes('received')) return { reachable: false, ms: null };
  const received = (out.match(/(\d+) received/) || [])[1];
  if (!received || received === '0') return { reachable: false, ms: null };
  const m = out.match(/rtt .+= [\d.]+\/([\d.]+)/);
  return { reachable: true, ms: m ? parseFloat(m[1]) : null };
}

// ── Helper: info Tailscale complete ──────────────────────────────────────────
async function getTailscaleInfo() {
  // Prima verifica se l'interfaccia Tailscale esiste
  const ifaceOut = await nsenterExec(
    '-t 1 -n',
    'ip -4 addr show ts0 2>/dev/null || ip -4 addr show tailscale0 2>/dev/null || true',
    5000
  );
  const tsIface = parseIpAddr(ifaceOut || '').find(i => i.name === 'ts0' || i.name === 'tailscale0');
  if (!tsIface) return { online: false, ip: null, hostname: null, devices: [], exitNode: null, routes: [] };

  // tailscale status --json per info complete
  const jsonOut = await nsenterExec('-t 1 -m', 'tailscale status --json', 6000);
  if (!jsonOut) return { online: true, ip: tsIface.ip4, hostname: null, devices: [], exitNode: null, routes: [] };

  try {
    const data  = JSON.parse(jsonOut);
    const self  = data.Self  ?? {};
    const peers = Object.values(data.Peer ?? {});

    return {
      online:   true,
      ip:       self.TailscaleIPs?.[0]  ?? tsIface.ip4,
      hostname: self.DNSName?.replace(/\.$/, '') ?? null,
      devices:  peers.map(p => ({
        hostname: p.HostName || p.DNSName?.split('.')[0] || null,
        ip:       p.TailscaleIPs?.[0] ?? null,
        online:   p.Online  ?? false,
        os:       p.OS      ?? null,
        relay:    p.Relay   ?? null,
      })),
      exitNode: data.ExitNodeStatus?.TailscaleIPs?.[0] ?? null,
      routes:   self.SubnetRoutes ?? [],
    };
  } catch (err) {
    log.warn('network', 'parse tailscale JSON fallito', err);
    return { online: true, ip: tsIface.ip4, hostname: null, devices: [], exitNode: null, routes: [] };
  }
}

// ── GET /api/network ──────────────────────────────────────────────────────────
// Ritorna info di rete base + gateway + DNS + velocità link + Tailscale
router.get('/', async (req, res) => {
  try {
    const [ifaces, gateway, dns, tailscale, netStats] = await Promise.all([
      getHostIfaces(),
      getGateway(),
      getDns(),
      getTailscaleInfo(),
      si.networkStats(),
    ]);

    // Arricchisce ogni interfaccia con velocità link e traffico corrente
    const interfacesEnriched = await Promise.all(ifaces.map(async iface => {
      const stats    = netStats.find(n => n.iface === iface.name);
      const linkSpeed = await getLinkSpeed(iface.name);
      return {
        name:      iface.name,
        ip4:       iface.ip4,
        linkSpeed,           // Mbps, null se non disponibile
        rxSec:     Math.round(stats?.rx_sec ?? 0),
        txSec:     Math.round(stats?.tx_sec ?? 0),
        rxTotal:   stats?.rx_bytes  ?? null,
        txTotal:   stats?.tx_bytes  ?? null,
      };
    }));

    res.json({
      hostname:   readHostHostname(),
      localIp:    ifaces[0]?.ip4 ?? null,
      interfaces: interfacesEnriched,
      gateway,
      dns,
      tailscale,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/network/ping ─────────────────────────────────────────────────────
// Endpoint separato per ping (operazione lenta — non blocca /api/network)
router.get('/ping', async (req, res) => {
  try {
    const [gateway, [pingGateway, pingInternet]] = await Promise.all([
      getGateway(),
      Promise.all([
        // Ping gateway — lo calcoliamo di nuovo o lo prendiamo da query
        (async () => {
          const gw = req.query.gateway || await getGateway();
          return gw ? { host: gw, ...(await pingHost(gw)) } : { host: null, reachable: false, ms: null };
        })(),
        pingHost('8.8.8.8').then(r => ({ host: '8.8.8.8', ...r })),
      ]),
    ]);

    res.json({
      gateway: pingGateway,
      internet: pingInternet,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/network/ports ────────────────────────────────────────────────────
// Porte TCP in ascolto sull'host
router.get('/ports', async (req, res) => {
  try {
    const ports = await getOpenPorts();
    res.json({ ports, total: ports.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
