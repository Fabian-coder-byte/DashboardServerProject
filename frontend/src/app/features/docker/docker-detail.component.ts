import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { ContainerDetail } from '../../core/models/docker.model';
import { formatBytes } from '../../core/utils/format.utils';

@Component({
  selector: 'app-docker-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div style="margin-bottom: 20px">
      <a routerLink="/docker" class="btn btn-secondary btn-sm">
        <i class="bi bi-arrow-left"></i> Torna a Docker
      </a>
    </div>

    @if (loading) { <div class="loading">Caricamento dettagli...</div> }
    @if (error)   { <div class="error-msg"><i class="bi bi-exclamation-triangle-fill"></i> {{ error }}</div> }

    @if (detail) {
      <!-- Header -->
      <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-start">
        <div>
          <h1><i class="bi bi-box-seam"></i> {{ detail.name }}</h1>
          <div style="display: flex; align-items: center; gap: 10px; margin-top: 8px">
            <span [class]="'badge badge-' + statusBadge(detail.status)">{{ detail.status }}</span>
            <span class="text-muted" style="font-size: 12px">{{ detail.image }}</span>
            @if (detail.restartCount > 0) {
              <span class="badge badge-yellow"><i class="bi bi-arrow-clockwise"></i> {{ detail.restartCount }} restart</span>
            }
          </div>
        </div>
        <a [routerLink]="['/logs']" [queryParams]="{ container: detail.name }" class="btn btn-secondary">
          <i class="bi bi-terminal"></i> Vedi Log
        </a>
      </div>

      <!-- Stats live (solo se running) -->
      @if (detail.stats) {
        <div class="grid grid-4 mb-20">
          <div class="card">
            <div class="card__title"><i class="bi bi-cpu"></i> CPU</div>
            <div class="card__value" [class.text-red]="detail.stats.cpuUsage >= 80" [class.text-yellow]="detail.stats.cpuUsage >= 50 && detail.stats.cpuUsage < 80">
              {{ detail.stats.cpuUsage }}%
            </div>
          </div>
          <div class="card">
            <div class="card__title"><i class="bi bi-memory"></i> RAM</div>
            <div class="card__value">{{ formatBytes(detail.stats.memoryUsage) }}</div>
            <div class="card__sub">/ {{ formatBytes(detail.stats.memoryLimit) }}</div>
            <div class="progress-bar">
              <div class="progress-bar__fill"
                [class]="ramClass(detail.stats.memoryUsage, detail.stats.memoryLimit)"
                [style.width.%]="ramPercent(detail.stats.memoryUsage, detail.stats.memoryLimit)">
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card__title"><i class="bi bi-arrow-down-circle"></i> Rete RX</div>
            <div class="card__value" style="font-size: 20px">{{ formatBytes(detail.stats.networkRx) }}</div>
          </div>
          <div class="card">
            <div class="card__title"><i class="bi bi-arrow-up-circle"></i> Rete TX</div>
            <div class="card__value" style="font-size: 20px">{{ formatBytes(detail.stats.networkTx) }}</div>
          </div>
        </div>
      }

      <!-- Info + Porte -->
      <div class="grid grid-2 mb-20">

        <!-- Info generali -->
        <div class="card">
          <div class="card__title"><i class="bi bi-info-circle"></i> Informazioni</div>
          <table class="info-table mt-8">
            <tr>
              <td class="info-label">ID</td>
              <td class="font-mono">{{ detail.id }}</td>
            </tr>
            <tr>
              <td class="info-label">Immagine</td>
              <td>{{ detail.image }}</td>
            </tr>
            <tr>
              <td class="info-label">Stato</td>
              <td><span [class]="'badge badge-' + statusBadge(detail.status)">{{ detail.status }}</span></td>
            </tr>
            <tr>
              <td class="info-label">Avviato</td>
              <td>{{ formatDate(detail.startedAt) }}</td>
            </tr>
            @if (!detail.running) {
              <tr>
                <td class="info-label">Fermato</td>
                <td>{{ formatDate(detail.finishedAt) }}</td>
              </tr>
            }
            <tr>
              <td class="info-label">Restart</td>
              <td [class.text-yellow]="detail.restartCount > 0">{{ detail.restartCount }}</td>
            </tr>
            @if (detail.networks.length) {
              <tr>
                <td class="info-label">Reti</td>
                <td>{{ detail.networks.join(', ') }}</td>
              </tr>
            }
            @if (detail.cmd) {
              <tr>
                <td class="info-label">Comando</td>
                <td class="font-mono" style="font-size: 12px; word-break: break-all">{{ detail.cmd }}</td>
              </tr>
            }
          </table>
        </div>

        <!-- Porte -->
        <div class="card">
          <div class="card__title"><i class="bi bi-plug"></i> Porte esposte</div>
          @if (detail.ports.length === 0) {
            <div class="empty-msg" style="padding: 20px 0">Nessuna porta esposta</div>
          } @else {
            <div class="table-responsive">
            <table class="table mt-8">
              <thead>
                <tr><th>Container</th><th>Host IP</th><th>Host Port</th></tr>
              </thead>
              <tbody>
                @for (p of detail.ports; track p.containerPort) {
                  <tr>
                    <td class="font-mono">{{ p.containerPort }}</td>
                    <td class="text-muted">{{ p.hostIp }}</td>
                    <td class="font-mono">{{ p.hostPort ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
            </div>
          }
        </div>
      </div>

      <!-- Volumi -->
      <div class="card mb-20">
        <div class="card__title"><i class="bi bi-folder2-open"></i> Volumi montati</div>
        @if (detail.mounts.length === 0) {
          <div class="empty-msg" style="padding: 20px 0">Nessun volume montato</div>
        } @else {
          <div class="table-responsive">
          <table class="table mt-8">
            <thead>
              <tr><th>Tipo</th><th>Host (sorgente)</th><th>Container (destinazione)</th><th>Modalità</th></tr>
            </thead>
            <tbody>
              @for (m of detail.mounts; track m.destination) {
                <tr>
                  <td><span class="badge badge-blue">{{ m.type || 'bind' }}</span></td>
                  <td class="font-mono" style="font-size: 12px; color: var(--text-secondary)">{{ m.source }}</td>
                  <td class="font-mono" style="font-size: 12px">{{ m.destination }}</td>
                  <td><span [class]="'badge badge-' + (m.mode === 'ro' ? 'gray' : 'green')">{{ m.mode || 'rw' }}</span></td>
                </tr>
              }
            </tbody>
          </table>
          </div>
        }
      </div>

      <!-- Variabili d'ambiente -->
      <div class="card">
        <div class="card__title" style="display: flex; justify-content: space-between; align-items: center">
          <span><i class="bi bi-code-slash"></i> Variabili d'ambiente ({{ detail.env.length }})</span>
          <button class="btn btn-secondary btn-sm" (click)="showEnv = !showEnv">
            <i [class]="'bi bi-' + (showEnv ? 'eye-slash' : 'eye')"></i>
            {{ showEnv ? 'Nascondi' : 'Mostra' }}
          </button>
        </div>

        @if (showEnv) {
          <div class="table-responsive">
          <table class="table mt-8">
            <thead>
              <tr><th>Chiave</th><th>Valore</th></tr>
            </thead>
            <tbody>
              @for (e of detail.env; track e.key) {
                <tr>
                  <td class="font-mono" style="font-size: 12px; color: var(--accent-blue)">{{ e.key }}</td>
                  <td class="font-mono" style="font-size: 12px; word-break: break-all"
                    [class.text-muted]="isSensitive(e.key)">
                    {{ isSensitive(e.key) ? '••••••••' : e.value }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .info-table {
      width: 100%;
      border-collapse: collapse;

      tr { border-bottom: 1px solid rgba(45,49,72,.4); }
      tr:last-child { border-bottom: none; }
      td { padding: 8px 4px; font-size: 13px; }
    }

    .info-label {
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      width: 110px;
      padding-right: 16px;
    }
  `]
})
export class DockerDetailComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private poll?: Subscription;

  detail?: ContainerDetail;
  loading = true;
  error?: string;
  showEnv = false;

  formatBytes = formatBytes;

  private get containerName() {
    return this.route.snapshot.paramMap.get('name') ?? '';
  }

  statusBadge(status: string) {
    if (status === 'running') return 'green';
    if (status === 'paused')  return 'yellow';
    return 'red';
  }

  ramPercent(used: number, limit: number) {
    if (!limit) return 0;
    return Math.round((used / limit) * 100);
  }

  ramClass(used: number, limit: number) {
    const pct = this.ramPercent(used, limit);
    if (pct >= 85) return 'high';
    if (pct >= 60) return 'medium';
    return 'low';
  }

  formatDate(iso: string) {
    if (!iso || iso.startsWith('0001')) return '—';
    return new Date(iso).toLocaleString('it-IT');
  }

  isSensitive(key: string) {
    return /password|secret|token|key|pwd|api_key/i.test(key);
  }

  ngOnInit() {
    this.poll = interval(10000).pipe(
      startWith(0),
      switchMap(() => this.api.getContainerDetail(this.containerName))
    ).subscribe({
      next: data => { this.detail = data; this.loading = false; },
      error: () => { this.error = `Container "${this.containerName}" non trovato.`; this.loading = false; }
    });
  }

  ngOnDestroy() { this.poll?.unsubscribe(); }
}
