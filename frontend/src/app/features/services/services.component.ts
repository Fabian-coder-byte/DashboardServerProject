import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { Service, ServiceHealth } from '../../core/models/service.model';
import { categoryColor } from '../../core/utils/format.utils';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-header">
      <h1><i class="bi bi-layers-fill"></i> Servizi</h1>
      <p>{{ online }} online · {{ offline }} offline · {{ unknown }} sconosciuti</p>
    </div>

    @if (loading) { <div class="loading">Caricamento servizi...</div> }
    @if (error)   { <div class="error-msg"><i class="bi bi-exclamation-triangle-fill"></i> {{ error }}</div> }

    @if (!loading && !error) {
      <div class="grid grid-3">
        @for (svc of services; track svc.name) {
          <div class="card service-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start">
              <div>
                <div style="font-size: 15px; font-weight: 600; margin-bottom: 4px">{{ svc.name }}</div>
                <span [class]="'badge badge-' + categoryColor(svc.category)">{{ svc.category }}</span>
              </div>
              <span [class]="'badge badge-' + healthBadge(svc.name)">{{ healthStatus(svc.name) }}</span>
            </div>

            <p style="color: var(--text-muted); font-size: 13px; margin: 12px 0">{{ svc.description }}</p>

            <div class="service-meta">
              <span><i class="bi bi-plug"></i> :{{ svc.port }}</span>
              <span><i class="bi bi-shield"></i> {{ svc.exposure }}</span>
              <span><i class="bi bi-exclamation-circle"></i> {{ svc.criticality }}</span>
            </div>

            <div style="display: flex; gap: 8px; margin-top: 14px">
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
            </div>
          </div>
        }
      </div>

      @if (services.length === 0) {
        <div class="empty-msg">
          Nessun servizio configurato. Modifica <code>data/service-catalog.yml</code>.
        </div>
      }
    }
  `,
  styles: [`
    .service-card { transition: border-color .15s; }
    .service-card:hover { border-color: var(--accent-blue); }
    .service-meta {
      display: flex;
      gap: 14px;
      font-size: 12px;
      color: var(--text-muted);

      span { display: flex; align-items: center; gap: 4px; }
    }
    code { background: var(--bg-hover); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  `]
})
export class ServicesComponent implements OnInit {
  private api = inject(ApiService);

  services: Service[] = [];
  health: ServiceHealth[] = [];
  loading = true;
  error?: string;

  categoryColor = categoryColor;

  get online()  { return this.health.filter(h => h.status === 'online').length; }
  get offline() { return this.health.filter(h => h.status === 'offline').length; }
  get unknown() { return this.health.filter(h => h.status === 'unknown').length; }

  healthStatus(name: string): string {
    return this.health.find(h => h.name === name)?.status ?? 'unknown';
  }

  healthBadge(name: string): string {
    const s = this.healthStatus(name);
    if (s === 'online')  return 'green';
    if (s === 'offline') return 'red';
    return 'gray';
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
