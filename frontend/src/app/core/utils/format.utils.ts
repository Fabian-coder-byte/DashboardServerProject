export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}g ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function progressClass(percent: number): string {
  if (percent >= 85) return 'high';
  if (percent >= 60) return 'medium';
  return 'low';
}

export function categoryColor(category: string): string {
  const map: Record<string, string> = {
    'Media': 'purple', 'Photos': 'blue', 'Files': 'blue',
    'Networking': 'green', 'Monitoring': 'yellow', 'DevOps': 'red',
    'Database': 'blue', 'Utility': 'gray', 'Backup': 'yellow'
  };
  return map[category] ?? 'gray';
}
