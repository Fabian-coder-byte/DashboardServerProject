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
  compose_path?: string;
  compose_project?: string;
  volumes?: string[];
  api_type?: string;
}

export interface ServiceContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  statusText: string;
  ports: string[];
}

export interface JellyfinIntegration {
  type: 'jellyfin';
  error?: string;
  counts?: {
    MovieCount: number;
    SeriesCount: number;
    EpisodeCount: number;
    SongCount: number;
    AlbumCount: number;
    BookCount: number;
    ItemCount: number;
  };
  users: Array<{ name: string; isAdmin: boolean; lastActivity: string | null; }>;
  activeSessions: number;
  sessions: Array<{ userName: string; client: string; nowPlaying: string | null; }>;
  recentMovies: Array<{ name: string; year: number | null; durationMin: number | null; overview: string | null; }>;
  recentSeries: Array<{ name: string; year: number | null; overview: string | null; }>;
}

export interface ServiceDetail {
  service: Service;
  health: ServiceHealth;
  containers: ServiceContainer[];
  integration: JellyfinIntegration | null;
}

export interface ServiceActionResult {
  action: string;
  project: string;
  containers: number;
  succeeded: string[];
  failed: string[];
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

export interface BackupEntry {
  name: string;
  lastRun: string | null;
  status: 'success' | 'failed' | 'running' | 'never';
  sizeBytes: number | null;
  destination: string;
  nextRun: string | null;
}

export interface BackupData {
  backups: BackupEntry[];
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
