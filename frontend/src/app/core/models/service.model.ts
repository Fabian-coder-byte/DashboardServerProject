export interface Service {
  name: string;
  description: string;
  category: string;
  type: string;
  icon: string;
  url_local: string;
  url_tailscale?: string;
  port: number;
  exposure: string;
  criticality: string;
  healthcheck?: { type: string; url: string; };
}

export interface ServiceHealth {
  name: string;
  status: 'online' | 'offline' | 'unknown';
  responseTime: number | null;
}

export interface Alert {
  level: 'error' | 'warning' | 'info';
  type: string;
  message: string;
  timestamp: string;
}

export interface BlockDevice {
  name: string;
  path: string;
  size: number;
  type: 'disk' | 'part' | 'rom' | 'lvm' | string;
  fstype: string | null;
  mountpoint: string | null;
  label: string | null;
  vendor: string | null;
  model: string | null;
  parent: string | null;
  mounted: boolean;
}

export interface StorageFilesystem {
  mount: string;
  filesystem: string;
  type: string;
  total: number;
  used: number;
  free: number;
  usedPercent: number;
  mounted: boolean;
  warning: boolean;
}
