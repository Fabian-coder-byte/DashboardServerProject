import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { Container } from '../../core/models/docker.model';
import { formatBytes } from '../../core/utils/format.utils';

@Component({
  selector: 'app-docker',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-header">
      <h1><i class="bi bi-box-seam-fill"></i> Docker</h1>
      <p>{{ running }} container in esecuzione su {{ containers.length }} totali</p>
    </div>

    @if (loading) { <div class="loading">Caricamento container...</div> }
    @if (error)   { <div class="error-msg"><i class="bi bi-exclamation-triangle-fill"></i> {{ error }}</div> }

    @if (!loading && !error) {
      <!-- Summary cards -->
      <div class="grid grid-4 mb-20">
        <div class="card">
          <div class="card__title"><i class="bi bi-play-circle"></i> Running</div>
          <div class="card__value text-green">{{ running }}</div>
        </div>
        <div class="card">
          <div class="card__title"><i class="bi bi-stop-circle"></i> Stopped</div>
          <div class="card__value text-red">{{ stopped }}</div>
        </div>
        <div class="card">
          <div class="card__title"><i class="bi bi-box"></i> Totale</div>
          <div class="card__value">{{ containers.length }}</div>
        </div>
        <div class="card">
          <div class="card__title"><i class="bi bi-arrow-clockwise"></i> Aggiornamento</div>
          <div class="card__value" style="font-size: 14px; margin-top: 4px">ogni 10s</div>
        </div>
      </div>

      <!-- Filter -->
      <div style="display: flex; gap: 8px; margin-bottom: 16px">
        <button class="btn btn-secondary btn-sm" [class.btn-primary]="filter === 'all'" (click)="filter = 'all'">Tutti</button>
        <button class="btn btn-secondary btn-sm" [class.btn-primary]="filter === 'running'" (click)="filter = 'running'">Running</button>
        <button class="btn btn-secondary btn-sm" [class.btn-primary]="filter === 'stopped'" (click)="filter = 'stopped'">Stopped</button>
      </div>

      <!-- Container table -->
      <div class="card">
        @if (filtered.length === 0) {
          <div class="empty-msg">Nessun container trovato</div>
        } @else {
          <table class="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Immagine</th>
                <th>Stato</th>
                <th>Porte</th>
                <th>CPU</th>
                <th>RAM</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              @for (c of filtered; track c.id) {
                <tr>
                  <td>
                    <a [routerLink]="['/docker', c.name]" style="font-weight: 600; color: var(--text-primary)">{{ c.name }}</a>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px">{{ c.id }}</div>
                  </td>
                  <td class="text-muted" style="font-size: 12px">{{ c.image }}</td>
                  <td>
                    <span [class]="'badge badge-' + statusBadge(c.status)">{{ c.status }}</span>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px">{{ c.statusText }}</div>
                  </td>
                  <td class="text-muted">{{ c.ports.join(', ') || '—' }}</td>
                  <td>
                    @if (c.cpuUsage !== null) {
                      <span [class]="'text-' + cpuColor(c.cpuUsage)">{{ c.cpuUsage }}%</span>
                    } @else { <span class="text-muted">—</span> }
                  </td>
                  <td>
                    @if (c.memoryUsage !== null) {
                      <span>{{ formatBytes(c.memoryUsage) }}</span>
                      @if (c.memoryLimit) {
                        <div style="font-size: 11px; color: var(--text-muted)">/ {{ formatBytes(c.memoryLimit) }}</div>
                      }
                    } @else { <span class="text-muted">—</span> }
                  </td>
                  <td>
                    <div style="display: flex; gap: 6px">
                      <a [routerLink]="['/docker', c.name]" class="btn btn-secondary btn-sm" title="Dettagli">
                        <i class="bi bi-info-circle"></i>
                      </a>
                      <a [routerLink]="['/logs']" [queryParams]="{ container: c.name }" class="btn btn-secondary btn-sm" title="Log">
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
    }
  `
})
export class DockerComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private poll?: Subscription;

  containers: Container[] = [];
  filter: 'all' | 'running' | 'stopped' = 'all';
  loading = true;
  error?: string;

  formatBytes = formatBytes;

  get running() { return this.containers.filter(c => c.status === 'running').length; }
  get stopped() { return this.containers.filter(c => c.status !== 'running').length; }

  get filtered() {
    if (this.filter === 'running') return this.containers.filter(c => c.status === 'running');
    if (this.filter === 'stopped') return this.containers.filter(c => c.status !== 'running');
    return this.containers;
  }

  statusBadge(status: string) {
    if (status === 'running') return 'green';
    if (status === 'paused')  return 'yellow';
    return 'red';
  }

  cpuColor(cpu: number) {
    if (cpu >= 80) return 'red';
    if (cpu >= 50) return 'yellow';
    return 'green';
  }

  ngOnInit() {
    this.poll = interval(10000).pipe(
      startWith(0),
      switchMap(() => this.api.getContainers())
    ).subscribe({
      next: data => { this.containers = data; this.loading = false; },
      error: () => { this.error = 'Errore nel caricamento dei container.'; this.loading = false; }
    });
  }

  ngOnDestroy() { this.poll?.unsubscribe(); }
}
