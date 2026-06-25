export interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  statusText: string;
  ports: string[];
  created: number;
  cpuUsage: number | null;
  memoryUsage: number | null;
  memoryLimit: number | null;
}

export interface ContainerDetail {
  id: string;
  name: string;
  image: string;
  status: string;
  running: boolean;
  startedAt: string;
  finishedAt: string;
  restartCount: number;
  cmd: string;
  mounts: { source: string; destination: string; mode: string; type: string; }[];
  networks: string[];
  env: { key: string; value: string; }[];
  ports: { containerPort: string; hostPort: string | null; hostIp: string; }[];
  stats: {
    cpuUsage: number;
    memoryUsage: number;
    memoryLimit: number;
    networkRx: number;
    networkTx: number;
  } | null;
}

export interface DockerInfo {
  containers: number;
  running: number;
  paused: number;
  stopped: number;
  images: number;
  serverVersion: string;
  memTotal: number;
}
