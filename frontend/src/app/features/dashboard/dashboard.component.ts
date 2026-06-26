import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { interval, Subscription, forkJoin } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { SystemOverview } from '../../core/models/system.model';
import { Container } from '../../core/models/docker.model';
import { Alert } from '../../core/models/service.model';
import { formatBytes, formatUptime, progressClass } from '../../core/utils/format.utils';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
    <div class="page-header">
      <h1><i class="bi bi-grid-1x2-fill"></i> Dashboard</h1>
      <p>Panoramica sistema{{ system ? ' — ' + system.hostname : '' }}</p>
    </div>

    @if (loading) { <div class="loading">Caricamento...</div> }
    @if (error)   { <div class="error-msg"><i class="bi bi-exclamation-triangle-fill"></i> {{ error }}</div> }

    @if (system) {
      <!-- Metriche principali -->
      <div class="grid grid-4">
        <div class="card">
          <div class="card__title"><i class="bi bi-cpu"></i> CPU</div>
          <div class="card__value">{{ system.cpuUsage }}%</div>
          <div class="progress-bar">
            <div class="progress-bar__fill" [class]="progressClass(system.cpuUsage)" [style.width.%]="system.cpuUsage"></div>
          </div>
        </div>

        <div class="card">
          <div class="card__title"><i class="bi bi-memory"></i> RAM</div>
          <div class="card__value">{{ formatBytes(system.ram.used) }}</div>
          <div class="card__sub">{{ formatBytes(system.ram.total) }} totale · {{ system.ram.usedPercent }}%</div>
          <div class="progress-bar">
            <div class="progress-bar__fill" [class]="progressClass(system.ram.usedPercent)" [style.width.%]="system.ram.usedPercent"></div>
          </div>
        </div>

        <div class="card">
          <div class="card__title"><i class="bi bi-thermometer-half"></i> Temperatura</div>
          <div class="card__value" [class.text-red]="(system.temperature || 0) >= 70" [class.text-yellow]="(system.temperature || 0) >= 60 && (system.temperature || 0) < 70">
            {{ system.temperature !== null ? system.temperature + '°C' : 'N/D' }}
          </div>
          <div class="card__sub">{{ system.distro }}</div>
        </div>

        <div class="card">
          <div class="card__title"><i class="bi bi-clock"></i> Uptime</div>
          <div class="card__value" style="font-size: 20px">{{ formatUptime(system.uptime) }}</div>
          <div class="card__sub">Load: {{ system.loadAverage[0]?.toFixed(2) }}</div>
        </div>
      </div>

      <!-- Rete + Docker + Alert -->
      <div class="grid grid-3">
        <div class="card">
          <div class="card__title"><i class="bi bi-activity"></i> Rete</div>
          @for (iface of system.network.slice(0, 2); track iface.interface) {
            <div style="margin-top: 8px">
              <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px">{{ iface.interface }}</div>
              <div style="display: flex; gap: 16px; font-size: 13px">
                <span class="text-green"><i class="bi bi-arrow-down"></i> {{ formatBytes(iface.rxSec) }}/s</span>
                <span class="text-yellow"><i class="bi bi-arrow-up"></i> {{ formatBytes(iface.txSec) }}/s</span>
              </div>
            </div>
          }
        </div>

        <div class="card">
          <div class="card__title"><i class="bi bi-box-seam"></i> Docker</div>
          <div style="display: flex; gap: 20px; margin-top: 8px">
            <div>
              <div style="font-size: 28px; font-weight: 700; color: var(--accent-green)">{{ runningCount }}</div>
              <div style="font-size: 11px; color: var(--text-muted)">Running</div>
            </div>
            <div>
              <div style="font-size: 28px; font-weight: 700; color: var(--accent-red)">{{ stoppedCount }}</div>
              <div style="font-size: 11px; color: var(--text-muted)">Stopped</div>
            </div>
            <div>
              <div style="font-size: 28px; font-weight: 700">{{ containers.length }}</div>
              <div style="font-size: 11px; color: var(--text-muted)">Totale</div>
            </div>
          </div>
          <a routerLink="/docker" class="btn btn-secondary btn-sm mt-12" style="margin-top: 12px">
            <i class="bi bi-arrow-right"></i> Vai a Docker
          </a>
        </div>

        <div class="card">
          <div class="card__title"><i class="bi bi-bell"></i> Alert
            @if (alerts.length > 0) { <span class="badge badge-red">{{ alerts.length }}</span> }
          </div>
          @if (alerts.length === 0) {
            <div style="color: var(--accent-green); margin-top: 10px; font-size: 13px">
              <i class="bi bi-check-circle-fill"></i> Nessun alert attivo
            </div>
          }
          @for (alert of alerts.slice(0, 3); track alert.message) {
            <div class="alert-item" [class]="'alert-item--' + alert.level">
              <i [class]="'bi bi-' + alertIcon(alert.level)"></i>
              <span>{{ alert.message }}</span>
            </div>
          }
        </div>
      </div>

      <!-- Tabella container -->
      <div class="card">
        <div class="card__title" style="display: flex; justify-content: space-between; align-items: center">
          <span><i class="bi bi-list-ul"></i> Container Docker</span>
          <a routerLink="/docker" class="btn btn-secondary btn-sm">Tutti</a>
        </div>
        @if (containers.length === 0) {
          <div class="empty-msg">Nessun container trovato</div>
        } @else {
          <table class="table mt-12">
            <thead>
              <tr>
                <th>Nome</th><th>Immagine</th><th>Stato</th><th>Porte</th><th>CPU</th><th>RAM</th>
              </tr>
            </thead>
            <tbody>
              @for (c of containers.slice(0, 8); track c.id) {
                <tr>
                  <td style="font-weight: 500">{{ c.name }}</td>
                  <td class="text-muted">{{ c.image }}</td>
                  <td>
                    <span [class]="'badge badge-' + (c.status === 'running' ? 'green' : 'red')">{{ c.status }}</span>
                  </td>
                  <td class="text-muted">{{ c.ports.join(', ') || '—' }}</td>
                  <td>{{ c.cpuUsage !== null ? c.cpuUsage + '%' : '—' }}</td>
                  <td>{{ c.memoryUsage !== null ? formatBytes(c.memoryUsage) : '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    }
    </div><!-- /page -->
  `
})
export class DashboardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private poll?: Subscription;

  system?: SystemOverview;
  containers: Container[] = [];
  alerts: Alert[] = [];
  loading = true;
  error?: string;

  formatBytes = formatBytes;
  formatUptime = formatUptime;
  progressClass = progressClass;

  get runningCount() { return this.containers.filter(c => c.status === 'running').length; }
  get stoppedCount() { return this.containers.filter(c => c.status !== 'running').length; }

  alertIcon(level: string) {
    return level === 'error' ? 'x-circle-fill' : level === 'warning' ? 'exclamation-triangle-fill' : 'info-circle-fill';
  }

  ngOnInit() {
    this.poll = interval(10000).pipe(
      startWith(0),
      switchMap(() => forkJoin({
        system: this.api.getSystemOverview(),
        containers: this.api.getContainers(),
        alerts: this.api.getAlerts()
      }))
    ).subscribe({
      next: ({ system, containers, alerts }) => {
        this.system = system;
        this.containers = containers;
        this.alerts = alerts;
        this.loading = false;
      },
      error: () => {
        this.error = 'Impossibile connettersi al backend. Verifica che il server sia avviato.';
        this.loading = false;
      }
    });
  }

  ngOnDestroy() { this.poll?.unsubscribe(); }
}
