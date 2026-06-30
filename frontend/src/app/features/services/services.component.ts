import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { Service, ServiceHealth } from '../../core/models/service.model';
import { categoryColor } from '../../core/utils/format.utils';

interface ActionFeedback {
  type: 'success' | 'error';
  message: string;
}

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
    <div class="page-header">
      <h1><i class="bi bi-layers-fill"></i> Servizi</h1>
      <p>{{ online }} online · {{ offline }} offline · {{ unknown }} sconosciuti</p>
    </div>

    @if (loading) { <div class="loading">Caricamento servizi...</div> }
    @if (error)   { <div class="error-msg"><i class="bi bi-exclamation-triangle-fill"></i> {{ error }}</div> }

    @if (!loading && !error) {
      <!-- Toolbar: filtri categoria + toggle vista -->
      <div class="toolbar">
        <div class="filter-pills">
          <button class="pill" [class.active]="!selectedCategory" (click)="setCategory(null)">
            Tutti <span class="pill-count">{{ services.length }}</span>
          </button>
          @for (cat of categories; track cat) {
            <button class="pill" [class.active]="selectedCategory === cat" (click)="setCategory(cat)">
              {{ cat }} <span class="pill-count">{{ countByCategory(cat) }}</span>
            </button>
          }
        </div>
        <div class="view-toggle">
          <button class="view-btn" [class.active]="viewMode === 'card'" (click)="viewMode = 'card'" title="Vista card">
            <i class="bi bi-grid-3x3-gap-fill"></i>
          </button>
          <button class="view-btn" [class.active]="viewMode === 'table'" (click)="viewMode = 'table'" title="Vista tabella">
            <i class="bi bi-table"></i>
          </button>
        </div>
      </div>

      <!-- ── CARD VIEW ── -->
      @if (viewMode === 'card') {
        <div class="grid grid-3">
          @for (svc of filteredServices; track svc.name) {
            <div class="card service-card" [class.card-busy]="isBusy(svc.name)">
              <div style="display: flex; justify-content: space-between; align-items: flex-start">
                <div>
                  <div style="font-size: 15px; font-weight: 600; margin-bottom: 4px">{{ svc.name }}</div>
                  <span [class]="'badge badge-' + categoryColor(svc.category)">{{ svc.category }}</span>
                </div>
                <span [class]="'badge badge-' + healthBadge(svc.name)">
                  @if (isBusy(svc.name)) { <span class="spinner-xs"></span> }
                  {{ healthStatus(svc.name) }}
                </span>
              </div>

              <p style="color: var(--text-muted); font-size: 13px; margin: 12px 0">{{ svc.description }}</p>

              <div class="service-meta">
                <span><i class="bi bi-plug"></i> :{{ svc.port }}</span>
                <span><i class="bi bi-shield"></i> {{ svc.exposure }}</span>
                <span><i class="bi bi-exclamation-circle"></i> {{ svc.criticality }}</span>
              </div>

              @if (feedback(svc.name); as fb) {
                <div [class]="'action-feedback feedback-' + fb.type">
                  <i [class]="'bi bi-' + (fb.type === 'success' ? 'check-circle-fill' : 'x-circle-fill')"></i>
                  {{ fb.message }}
                </div>
              }

              <div style="display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap">
                <a [routerLink]="['/services', svc.name]" class="btn btn-secondary btn-sm">
                  <i class="bi bi-info-circle"></i> Dettagli
                </a>
                @if (svc.url_local) {
                  <a [href]="svc.url_local" target="_blank" class="btn btn-primary btn-sm">
                    <i class="bi bi-box-arrow-up-right"></i> Apri LAN
                  </a>
                }
                @if (svc.url_tailscale) {
                  <a [href]="svc.url_tailscale" target="_blank" class="btn btn-secondary btn-sm">
                    <i class="bi bi-shield-lock"></i> Tailscale
                  </a>
                }

                @if (hasComposeControl(svc)) {
                  <div class="compose-actions">
                    @if (healthStatus(svc.name) !== 'online') {
                      <button class="btn btn-success btn-sm"
                              [disabled]="isBusy(svc.name)"
                              (click)="runAction(svc, 'start')">
                        <i class="bi bi-play-fill"></i> Avvia
                      </button>
                    }
                    @if (healthStatus(svc.name) === 'online') {
                      <button class="btn btn-warning btn-sm"
                              [disabled]="isBusy(svc.name)"
                              (click)="runAction(svc, 'restart')">
                        <i class="bi bi-arrow-clockwise"></i> Riavvia
                      </button>
                      <button class="btn btn-danger btn-sm"
                              [disabled]="isBusy(svc.name)"
                              (click)="runAction(svc, 'stop')">
                        <i class="bi bi-stop-fill"></i> Ferma
                      </button>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- ── TABLE VIEW ── -->
      @if (viewMode === 'table') {
        <div class="table-wrap card">
          <table class="svc-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Porta</th>
                <th>Esposizione</th>
                <th>Criticità</th>
                <th>Stato</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              @for (svc of filteredServices; track svc.name) {
                <tr [class.row-busy]="isBusy(svc.name)">
                  <td>
                    <div class="svc-name">{{ svc.name }}</div>
                    <div class="svc-desc">{{ svc.description }}</div>
                  </td>
                  <td>
                    <span [class]="'badge badge-' + categoryColor(svc.category)">{{ svc.category }}</span>
                  </td>
                  <td><code class="port-code">:{{ svc.port }}</code></td>
                  <td style="font-size: 13px; color: var(--text-muted)">{{ svc.exposure }}</td>
                  <td><span [class]="'crit-' + svc.criticality">{{ svc.criticality }}</span></td>
                  <td>
                    <span [class]="'badge badge-' + healthBadge(svc.name)">
                      @if (isBusy(svc.name)) { <span class="spinner-xs"></span> }
                      {{ healthStatus(svc.name) }}
                    </span>
                  </td>
                  <td>
                    <div class="table-actions">
                      <a [routerLink]="['/services', svc.name]" class="btn btn-secondary btn-sm" title="Dettagli">
                        <i class="bi bi-info-circle"></i>
                      </a>
                      @if (svc.url_local) {
                        <a [href]="svc.url_local" target="_blank" class="btn btn-primary btn-sm" title="Apri LAN">
                          <i class="bi bi-box-arrow-up-right"></i> LAN
                        </a>
                      }
                      @if (hasComposeControl(svc) && healthStatus(svc.name) !== 'online') {
                        <button class="btn btn-success btn-sm" title="Avvia"
                                [disabled]="isBusy(svc.name)" (click)="runAction(svc, 'start')">
                          <i class="bi bi-play-fill"></i>
                        </button>
                      }
                      @if (hasComposeControl(svc) && healthStatus(svc.name) === 'online') {
                        <button class="btn btn-warning btn-sm" title="Riavvia"
                                [disabled]="isBusy(svc.name)" (click)="runAction(svc, 'restart')">
                          <i class="bi bi-arrow-clockwise"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" title="Ferma"
                                [disabled]="isBusy(svc.name)" (click)="runAction(svc, 'stop')">
                          <i class="bi bi-stop-fill"></i>
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (filteredServices.length === 0 && services.length > 0) {
        <div class="empty-msg">Nessun servizio nella categoria selezionata.</div>
      }
      @if (services.length === 0) {
        <div class="empty-msg">
          Nessun servizio configurato. Modifica <code>data/service-catalog.yml</code>.
        </div>
      }
    }
    </div><!-- /page -->
  `,
  styles: [`
    /* ── toolbar ── */
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .filter-pills {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .pill {
      background: var(--bg-hover);
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 13px;
      cursor: pointer;
      transition: all .15s;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .pill:hover { border-color: var(--accent-blue); color: var(--text); }
    .pill.active { background: var(--accent-blue); border-color: var(--accent-blue); color: #fff; }
    .pill-count {
      background: rgba(255,255,255,.15);
      border-radius: 10px;
      padding: 0 6px;
      font-size: 11px;
    }
    .pill.active .pill-count { background: rgba(255,255,255,.3); }

    /* ── view toggle ── */
    .view-toggle { display: flex; gap: 4px; }
    .view-btn {
      background: var(--bg-hover);
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 6px 11px;
      border-radius: 6px;
      cursor: pointer;
      transition: all .15s;
      font-size: 15px;
    }
    .view-btn:hover { border-color: var(--accent-blue); color: var(--text); }
    .view-btn.active { background: var(--accent-blue); border-color: var(--accent-blue); color: #fff; }

    /* ── card view ── */
    .service-card { transition: border-color .15s, opacity .15s; }
    .service-card:hover { border-color: var(--accent-blue); }
    .service-card.card-busy { opacity: .75; pointer-events: none; }
    .service-meta {
      display: flex;
      gap: 14px;
      font-size: 12px;
      color: var(--text-muted);
      span { display: flex; align-items: center; gap: 4px; }
    }
    .compose-actions { display: flex; gap: 6px; margin-left: auto; }

    /* ── table view ── */
    .table-wrap { overflow-x: auto; padding: 0; }
    .svc-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .svc-table th {
      text-align: left;
      padding: 11px 16px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: .6px;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    .svc-table td {
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    .svc-table tbody tr:last-child td { border-bottom: none; }
    .svc-table tbody tr:hover td { background: var(--bg-hover); }
    .svc-table tr.row-busy { opacity: .6; pointer-events: none; }
    .svc-name { font-weight: 600; }
    .svc-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
    .port-code {
      background: rgba(96,165,250,.12);
      border: 1px solid rgba(96,165,250,.3);
      color: var(--accent-blue);
      padding: 2px 8px;
      border-radius: 5px;
      font-size: 13px;
      font-family: monospace;
    }
    .crit-high   { color: #ea868f; font-weight: 600; font-size: 13px; }
    .crit-medium { color: #e0a900; font-size: 13px; }
    .crit-low    { color: var(--text-muted); font-size: 13px; }
    .table-actions { display: flex; gap: 5px; align-items: center; flex-wrap: nowrap; }

    /* ── buttons ── */
    .btn-success  { background: #198754; color: #fff; border: none; }
    .btn-success:hover:not(:disabled)  { background: #157347; }
    .btn-warning  { background: #e0a900; color: #000; border: none; }
    .btn-warning:hover:not(:disabled)  { background: #c69500; }
    .btn-danger   { background: #dc3545; color: #fff; border: none; }
    .btn-danger:hover:not(:disabled)   { background: #b02a37; }
    button:disabled { opacity: .5; cursor: not-allowed; }

    .action-feedback {
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 6px;
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .feedback-success { background: rgba(25,135,84,.15); color: #75b798; }
    .feedback-error   { background: rgba(220,53,69,.15);  color: #ea868f; }

    .spinner-xs {
      display: inline-block;
      width: 10px; height: 10px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin .6s linear infinite;
      margin-right: 4px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    code { background: var(--bg-hover); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  `]
})
export class ServicesComponent implements OnInit {
  private api = inject(ApiService);

  services: Service[] = [];
  health: ServiceHealth[] = [];
  loading = true;
  error?: string;

  viewMode: 'card' | 'table' = 'card';
  selectedCategory: string | null = null;

  private busySet   = new Set<string>();
  private feedbacks = new Map<string, ActionFeedback>();

  categoryColor = categoryColor;

  get online()  { return this.health.filter(h => h.status === 'online').length; }
  get offline() { return this.health.filter(h => h.status === 'offline').length; }
  get unknown() { return this.health.filter(h => h.status === 'unknown').length; }

  get categories(): string[] {
    return [...new Set(this.services.map(s => s.category))].sort();
  }

  get filteredServices(): Service[] {
    if (!this.selectedCategory) return this.services;
    return this.services.filter(s => s.category === this.selectedCategory);
  }

  countByCategory(cat: string): number {
    return this.services.filter(s => s.category === cat).length;
  }

  setCategory(cat: string | null): void {
    this.selectedCategory = cat;
  }

  healthStatus(name: string): string {
    return this.health.find(h => h.name === name)?.status ?? 'unknown';
  }

  healthBadge(name: string): string {
    const s = this.healthStatus(name);
    if (s === 'online')  return 'green';
    if (s === 'offline') return 'red';
    return 'gray';
  }

  isBusy(name: string): boolean {
    return this.busySet.has(name);
  }

  feedback(name: string): ActionFeedback | undefined {
    return this.feedbacks.get(name);
  }

  hasComposeControl(svc: Service): boolean {
    return svc.type === 'docker' && !!(svc.compose_path || svc.compose_project);
  }

  runAction(svc: Service, action: 'start' | 'stop' | 'restart'): void {
    const actionLabel = { start: 'avviare', stop: 'fermare', restart: 'riavviare' }[action];
    const needsConfirm = (action === 'stop' || action === 'restart') && svc.criticality === 'high';

    if (needsConfirm) {
      const ok = window.confirm(
        `Sei sicuro di voler ${actionLabel} "${svc.name}"?\n\nQuesto servizio è marcato come CRITICITÀ ALTA.`
      );
      if (!ok) return;
    }

    this.busySet.add(svc.name);
    this.feedbacks.delete(svc.name);

    this.api.serviceAction(svc.name, action).subscribe({
      next: (result) => {
        this.busySet.delete(svc.name);
        const msg = result.failed.length === 0
          ? `${result.succeeded.length} container ${action === 'start' ? 'avviati' : action === 'stop' ? 'fermati' : 'riavviati'} correttamente`
          : `Completato con ${result.failed.length} errori`;
        this.setFeedback(svc.name, result.failed.length === 0 ? 'success' : 'error', msg);
        this.refreshHealth(svc.name);
      },
      error: (err) => {
        this.busySet.delete(svc.name);
        const msg = err.error?.error ?? err.message ?? 'Errore durante l\'operazione';
        this.setFeedback(svc.name, 'error', msg);
      }
    });
  }

  private setFeedback(name: string, type: 'success' | 'error', message: string): void {
    this.feedbacks.set(name, { type, message });
    setTimeout(() => this.feedbacks.delete(name), 5000);
  }

  private refreshHealth(name: string): void {
    setTimeout(() => {
      this.api.getServiceHealth(name).subscribe({
        next: (h) => {
          const idx = this.health.findIndex(x => x.name === name);
          if (idx >= 0) this.health[idx] = h;
          else this.health.push(h);
        }
      });
    }, 2500);
  }

  ngOnInit() {
    forkJoin({
      services: this.api.getServices(),
      health: this.api.getServicesHealth()
    }).subscribe({
      next: ({ services, health }) => {
        this.services = services;
        this.health = health;
        this.loading = false;
      },
      error: () => {
        this.error = 'Errore nel caricamento dei servizi.';
        this.loading = false;
      }
    });
  }
}
