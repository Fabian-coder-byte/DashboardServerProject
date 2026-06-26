export interface SystemOverview {
  hostname: string;
  platform: string;
  distro: string;
  uptime: number;
  cpuUsage: number;
  ram: { total: number; used: number; free: number; usedPercent: number; };
  swap: { total: number; used: number; free: number; };
  temperature: number | null;
  loadAverage: number[];
  network: { interface: string; rxSec: number; txSec: number; }[];
}

export interface MetricSample {
  t: number;
  cpu: number;
  ram: number;
  temp: number | null;
  netRx: number;
  netTx: number;
}

export interface SystemSpecs {
  cpu: { manufacturer: string; brand: string; speed: number; cores: number; physicalCores: number };
  ram: { total: number };
  os:  { distro: string; release: string; kernel: string; arch: string; hostname: string };
  system: { manufacturer: string; model: string };
}

export interface CpuInfo {
  manufacturer: string;
  brand: string;
  cores: number;
  physicalCores: number;
  currentLoad: number;
  coresLoad: number[];
}
