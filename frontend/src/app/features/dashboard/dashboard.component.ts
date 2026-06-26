import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { interval, Subscription, forkJoin } from 'rxjs';
import { startWith, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { SystemOverview, NetworkInfo } from '../../core/models/system.model';
import { Container } from '../../core/models/docker.model';
import { Alert, Service, ServiceHealth, BackupEntry, BackupData } from '../../core/models/service.model';
import { formatBytes, formatUptime, progressClass } from '../../core/utils/format.utils';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
    <div class="page-header">
      <h1><i class="bi bi-grid-1x2-fill"></i> Dashboard</h1>
      <p>{{ system?.hostname ?? 'PiControl' }} — Panoramica sistema</p>
    </div>

    @if (loading) { <div class="loading">Caricamento...</div> }
    @if (error)   { <div class="error-msg"><i class="bi bi-exclamation-triangle-fill"></i> {{ error }}</div> }

    @if (!loading && !error) {

      <!-- ── Row 1: metriche sistema ─────────────────────────────────── -->
      @if (system) {
        <div class="grid grid-4">
          <div class="card">
            <div class="card__title"><i class="bi bi-cpu"></i> CPU</div>
            <div class="card__value">{{ system.cpuUsage }}%</div>
            <div class="progress-bar">
              <div class="progress-bar__fill" [class]="progressClass(system.cpuUsage)" [style.width.%]="system.cpuUsage"></div>
            </div>
            <div class="card__sub">Load: {{ system.loadAverage[0]?.toFixed(2) ?? '—' }}</div>
          </div>

          <div class="card">
            <div class="card__title"><i class="bi bi-memory"></i> RAM</div>
            <div class="card__value">{{ formatBytes(system.ram.used) }}</div>
            <div class="progress-bar">
              <div class="progress-bar__fill" [class]="progressClass(system.ram.usedPercent)" [style.width.%]="system.ram.usedPercent"></div>
            </div>
            <div class="card__sub">{{ system.ram.usedPercent }}% di {{ formatBytes(system.ram.total) }}</div>
          </div>

          <div class="card">
            <div class="card__title"><i class="bi bi-thermometer-half"></i> Temperatura</div>
            <div class="card__value"
              [class.text-red]="(system.temperature ?? 0) >= 75"
              [class.text-yellow]="(system.temperature ?? 0) >= 60 && (system.temperature ?? 0) < 75">
              {{ system.temperature !== null ? system.temperature + '°C' : 'N/D' }}
            </div>
            <div class="card__sub">{{ system.distro }}</div>
          </div>

          <div class="card">
            <div class="card__title"><i class="bi bi-clock"></i> Uptime</div>
            <div class="card__value" style="font-size:20px">{{ formatUptime(system.uptime) }}</div>
            <div class="card__sub">
              @if (system.network[0]) {
                <i class="bi bi-arrow-down text-green"></i> {{ formatBytes(system.network[0].rxSec) }}/s
              }
            </div>
          </div>
        </div>
      }

      <!-- ── Row 2: storage, tailscale, backup, docker ──────────────── -->
      <div class="grid grid-4">

        <!-- /mnt/storage1 -->
        <div class="card" [class.border-alert]="storageLoaded && !storage1">
          <div class="card__title"><i class="bi bi-hdd-fill"></i> /mnt/storage1</div>
          @if (!storageLoaded) {
            <div class="card__value text-muted" style="font-size:15px">Verifica...</div>
          } @else if (!storage1) {
            <div class="card__value text-red">Non montato</div>
            <div class="card__sub">Jellyfin, Immich, Nextcloud offline</div>
          } @else {
            <div class="card__value text-green" style="font-size:16px">Montato</div>
            <div class="progress-bar">
              <div class="progress-bar__fill" [class]="progressClass(storage1.usedPercent)" [style.width.%]="storage1.usedPercent"></div>
            </div>
            <div class="card__sub">{{ formatBytes(storage1.free) }} liberi / {{ formatBytes(storage1.total) }}</div>
          }
        </div>

        <!-- Tailscale -->
        <div class="card">
          <div class="card__title"><i class="bi bi-shield-lock"></i> Tailscale</div>
          @if (!networkLoaded) {
            <div class="card__value text-muted" style="font-size:15px">Verifica...</div>
          } @else if (network?.tailscale?.online) {
            <div class="card__value text-green" style="font-size:16px">Online</div>
            <div class="card__sub">{{ network!.tailscale.ip }}</div>
            @if (network!.tailscale.hostname) {
              <div class="card__sub" style="word-break:break-all">{{ network!.tailscale.hostname }}</div>
            }
          } @else {
            <div class="card__value text-red" style="font-size:16px">Offline</div>
            <div class="card__sub">IP locale: {{ network?.localIp ?? '—' }}</div>
          }
          <a routerLink="/network" class="btn btn-secondary btn-sm" style="margin-top:10px">
            <i class="bi bi-arrow-right"></i> Rete
          </a>
        </div>

        <!-- Backup -->
        <div class="card" [class.border-alert]="backupLoaded && lastBackup?.status === 'failed'">
          <div class="card__title"><i class="bi bi-cloud-check"></i> Backup</div>
          @if (!backupLoaded) {
            <div class="card__value text-muted" style="font-size:15px">Verifica...</div>
          } @else if (!lastBackup) {
            <div class="card__value text-muted" style="font-size:14px">Nessun backup</div>
          } @else {
            <div class="card__value" style="font-size:16px"
              [class.text-green]="lastBackup.status === 'success'"
              [class.text-red]="lastBackup.status === 'failed'"
              [class.text-muted]="lastBackup.status === 'never'">
              {{ backupStatusLabel(lastBackup.status) }}
            </div>
            <div class="card__sub">{{ lastBackup.name }}</div>
            @if (lastBackup.lastRun) {
              <div class="card__sub">{{ formatDate(lastBackup.lastRun) }}</div>
            }
          }
          <a routerLink="/backup" class="btn btn-secondary btn-sm" style="margin-top:10px">
            <i class="bi bi-arrow-right"></i> Dettagli
          </a>
        </div>

        <!-- Docker summary -->
        <div class="card">
          <div class="card__title"><i class="bi bi-box-seam"></i> Docker</div>
          <div style="display:flex;gap:16px;margin-top:8px">
            <div>
              <div style="font-size:26px;font-weight:700;color:var(--accent-green)">{{ runningCount }}</div>
              <div style="font-size:11px;color:var(--text-muted)">Running</div>
            </div>
            <div>
              <div style="font-size:26px;font-weight:700;color:var(--accent-red)">{{ stoppedCount }}</div>
              <div style="font-size:11px;color:var(--text-muted)">Stopped</div>
            </div>
            <div>
              <div style="font-size:26px;font-weight:700">{{ containers.length }}</div>
              <div style="font-size:11px;color:var(--text-muted)">Totale</div>
            </div>
          </div>
          <a routerLink="/docker" class="btn btn-secondary btn-sm" style="margin-top:10px">
            <i class="bi bi-arrow-right"></i> Docker
          </a>
        </div>

      </div>

      <!-- ── Servizi principali ───────────────────────────────────────── -->
      @if (keyServices.length > 0) {
        <div class="card">
          <div class="card__title" style="display:flex;justify-content:space-between;align-items:center">
            <span><i class="bi bi-layers"></i> Servizi principali</span>
            <a routerLink="/services" class="btn btn-secondary btn-sm">Tutti i servizi</a>
          </div>
          <div class="services-grid">
            @for (svc of keyServices; track svc.name) {
              <div class="svc-chip">
                <div class="svc-chip__header">
                  <span class="svc-chip__name">{{ svc.name }}</span>
                  <span [class]="'badge badge-' + healthBadge(svc.name)" style="font-size:10px">
                    {{ healthStatus(svc.name) }}
                  </span>
                </div>
                <div class="card__sub" style="margin-top:4px">:{{ svc.port }}</div>
                @if (svc.url_local) {
                  <a [href]="svc.url_local" target="_blank" class="btn btn-primary btn-sm" style="margin-top:8px">
                    <i class="bi bi-box-arrow-up-right"></i> Apri
                  </a>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- ── Container Docker ────────────────────────────────────────── -->
      <div class="card">
        <div class="card__title" style="display:flex;justify-content:space-between;align-items:center">
          <span><i class="bi bi-list-ul"></i> Container Docker</span>
          <a routerLink="/docker" class="btn btn-secondary btn-sm">Tutti ({{ containers.length }})</a>
        </div>
        @if (containers.length === 0) {
          <div class="empty-msg">Nessun container trovato</div>
        } @else {
          <table class="table mt-12">
            <thead>
              <tr><th>Nome</th><th>Stato</th><th>Porte</th><th>CPU</th><th>RAM</th><th></th></tr>
            </thead>
            <tbody>
              @for (c of containers.slice(0, 12); track c.id) {
                <tr>
                  <td style="font-weight:500">{{ c.name }}</td>
                  <td>
                    <span [class]="'badge badge-' + (c.status === 'running' ? 'green' : 'red')">{{ c.status }}</span>
                  </td>
                  <td class="text-muted" style="font-size:12px">{{ c.ports.join(', ') || '—' }}</td>
                  <td>{{ c.cpuUsage !== null ? c.cpuUsage + '%' : '—' }}</td>
                  <td>{{ c.memoryUsage !== null ? formatBytes(c.memoryUsage) : '—' }}</td>
                  <td>
                    <div style="display:flex;gap:4px">
                      <a [routerLink]="['/docker', c.name]" class="btn btn-secondary btn-sm" title="Dettagli">
                        <i class="bi bi-info-circle"></i>
                      </a>
                      <a [routerLink]="['/logs']" [queryParams]="{container: c.name}" class="btn btn-secondary btn-sm" title="Log">
                        <i class="bi bi-terminal"></i>
                      </a>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <!-- ── Alert ───────────────────────────────────────────────────── -->
      <div class="card">
        <div class="card__title">
          <span><i class="bi bi-bell"></i> Alert</span>
          @if (alerts.length > 0) { <span class="badge badge-red" style="margin-left:6px">{{ alerts.length }}</span> }
        </div>
        @if (alerts.length === 0) {
          <div style="color:var(--accent-green);margin-top:12px;font-size:13px">
            <i class="bi bi-check-circle-fill"></i> Nessun alert attivo
          </div>
        }
        @for (alert of alerts; track alert.message) {
          <div class="alert-item" style="margin-top:8px" [class]="'alert-item--' + alert.level">
            <i [class]="'bi bi-' + alertIcon(alert.level)"></i>
            <span>{{ alert.message }}</span>
          </div>
        }
      </div>

    }
    </div><!-- /page -->
  `,
  styles: [`
    .border-alert { border-color: var(--accent-red) !important; }

    .services-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }

    .svc-chip {
      background: var(--bg-hover);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 12px;
    }

    .svc-chip__header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 6px;
    }

    .svc-chip__name {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.3;
    }

    .mt-12 { margin-top: 12px; }

    @media (max-width: 640px) {
      .services-grid { grid-template-columns: repeat(2, 1fr); }
    }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private poll?: Subscription;

  system?: SystemOverview;
  network?: NetworkInfo;
  filesystems: any[] = [];
  containers: Container[] = [];
  alerts: Alert[] = [];
  services: Service[] = [];
  health: ServiceHealth[] = [];
  backupData?: BackupData;

  storageLoaded = false;
  networkLoaded = false;
  backupLoaded  = false;
  loading = true;
  error?: string;

  formatBytes  = formatBytes;
  formatUptime = formatUptime;
  progressClass = progressClass;

  formatDate(iso: string) {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  backupStatusLabel(status: string): string {
    if (status === 'success') return 'OK';
    if (status === 'failed')  return 'Fallito';
    if (status === 'running') return 'In corso';
    return 'Mai eseguito';
  }

  get runningCount() { return this.containers.filter(c => c.status === 'running').length; }
  get stoppedCount()  { return this.containers.filter(c => c.status !== 'running').length; }

  get storage1() { return this.filesystems.find(f => f.mount === '/mnt/storage1') ?? null; }

  get keyServices() {
    return this.services.filter(s => s.criticality === 'high' || s.criticality === 'medium');
  }

  get lastBackup(): BackupEntry | null {
    if (!this.backupData?.backups?.length) return null;
    return [...this.backupData.backups].sort((a, b) => {
      if (!a.lastRun) return 1;
      if (!b.lastRun) return -1;
      return new Date(b.lastRun).getTime() - new Date(a.lastRun).getTime();
    })[0];
  }

  healthStatus(name: string): string {
    return this.health.find(h => h.name === name)?.status ?? 'unknown';
  }

  healthBadge(name: string): string {
    const s = this.healthStatus(name);
    return s === 'online' ? 'green' : s === 'offline' ? 'red' : 'gray';
  }

  alertIcon(level: string) {
    return level === 'error' ? 'x-circle-fill' : level === 'warning' ? 'exclamation-triangle-fill' : 'info-circle-fill';
  }

  ngOnInit() {
    // One-time: storage, services, backup
    forkJoin({
      storage:  this.api.getStorage().pipe(catchError(() => of({ disks: [], filesystems: [] }))),
      services: this.api.getServices().pipe(catchError(() => of([]))),
      health:   this.api.getServicesHealth().pipe(catchError(() => of([]))),
      backup:   this.api.getBackupStatus().pipe(catchError(() => of({ backups: [] })))
    }).subscribe(({ storage, services, health, backup }) => {
      this.filesystems = storage.filesystems;
      this.storageLoaded = true;
      this.services  = services as Service[];
      this.health    = health as ServiceHealth[];
      this.backupData = backup as BackupData;
      this.backupLoaded = true;
    });

    // Poll every 15s: system, containers, alerts, network
    this.poll = interval(15000).pipe(
      startWith(0),
      switchMap(() => forkJoin({
        system:     this.api.getSystemOverview(),
        containers: this.api.getContainers(),
        alerts:     this.api.getAlerts(),
        network:    this.api.getNetworkInfo().pipe(catchError(() => of(null)))
      }))
    ).subscribe({
      next: ({ system, containers, alerts, network }) => {
        this.system     = system;
        this.containers = containers;
        this.alerts     = alerts;
        if (network) { this.network = network as NetworkInfo; this.networkLoaded = true; }
        this.loading = false;
      },
      error: () => {
        this.error   = 'Impossibile connettersi al backend. Verifica che il server sia avviato.';
        this.loading = false;
      }
    });
  }

  ngOnDestroy() { this.poll?.unsubscribe(); }
}
