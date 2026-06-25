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
