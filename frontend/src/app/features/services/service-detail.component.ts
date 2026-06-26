import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ServiceDetail, JellyfinIntegration } from '../../core/models/service.model';
import { categoryColor } from '../../core/utils/format.utils';

@Component({
  selector: 'app-service-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">

      <!-- Back + header -->
      <div class="page-header">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <a routerLink="/services" class="btn btn-secondary btn-sm">
            <i class="bi bi-arrow-left"></i> Servizi
          </a>
          @if (detail) {
            <h1 style="margin:0;display:flex;align-items:center;gap:10px">
              <i class="bi bi-layers-fill" style="color:var(--accent-blue)"></i>
              {{ detail.service.name }}
            </h1>
            <span [class]="'badge badge-' + healthBadge()">{{ detail.health.status }}</span>
            @if (detail.health.responseTime) {
              <span class="text-muted" style="font-size:12px">{{ detail.health.responseTime }} ms</span>
            }
          } @else if (!loading) {
            <h1 style="margin:0">Servizio</h1>
          }
        </div>

        @if (detail) {
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            @if (detail.service.url_local) {
              <a [href]="detail.service.url_local" target="_blank" class="btn btn-primary btn-sm">
                <i class="bi bi-box-arrow-up-right"></i> Apri LAN
              </a>
            }
            @if (detail.service.url_tailscale) {
              <a [href]="detail.service.url_tailscale" target="_blank" class="btn btn-secondary btn-sm">
                <i class="bi bi-shield-lock"></i> Tailscale
              </a>
            }
          </div>
        }
      </div>

      @if (loading) { <div class="loading">Caricamento dettagli...</div> }
      @if (error)   { <div class="error-msg"><i class="bi bi-exclamation-triangle-fill"></i> {{ error }}</div> }

      @if (detail) {

        <!-- Info + Stato affiancati -->
        <div class="grid grid-2">

          <!-- Informazioni generali -->
          <div class="card">
            <div class="detail-title"><i class="bi bi-info-circle"></i> Informazioni</div>
            <div class="info-grid">
              <div class="info-row">
                <span class="info-label">Categoria</span>
                <span [class]="'badge badge-' + categoryColor(detail.service.category)">{{ detail.service.category }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Porta</span>
                <span class="mono">:{{ detail.service.port }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Tipo</span>
                <span class="badge badge-gray">{{ detail.service.type }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Esposizione</span>
                <span class="badge badge-blue">{{ detail.service.exposure }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Criticità</span>
                <span [class]="'badge badge-' + critBadge(detail.service.criticality)">{{ detail.service.criticality }}</span>
              </div>
              @if (detail.service.compose_path) {
                <div class="info-row">
                  <span class="info-label">Compose</span>
                  <span class="mono small">{{ detail.service.compose_path }}</span>
                </div>
              }
            </div>

            @if (detail.service.description) {
              <p class="description">{{ detail.service.description }}</p>
            }

            @if (detail.service.volumes?.length) {
              <div class="detail-title" style="margin-top:16px"><i class="bi bi-folder2"></i> Volumi</div>
              @for (v of (detail.service.volumes ?? []); track v) {
                <div class="volume-row"><i class="bi bi-arrow-right-short" style="color:var(--text-muted)"></i> <span class="mono small">{{ v }}</span></div>
              }
            }
          </div>

          <!-- Container Compose -->
          <div class="card">
            <div class="detail-title"><i class="bi bi-box-seam"></i> Container ({{ detail.containers.length }})</div>

            @if (detail.containers.length === 0) {
              <div class="empty-msg" style="padding:20px 0">
                @if (detail.service.compose_path) {
                  Nessun container trovato per questo progetto Compose.
                } @else {
                  <i class="bi bi-exclamation-triangle"></i> Configura <code>compose_path</code> nel service-catalog.yml per mostrare i container.
                }
              </div>
            }

            @for (c of detail.containers; track c.id) {
              <div class="ctr-item">
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                  <div>
                    <div style="font-weight:600;font-size:13px">{{ c.name }}</div>
                    <div class="mono small" style="color:var(--text-muted);margin-top:2px">{{ c.image }}</div>
                  </div>
                  <span [class]="'badge badge-' + (c.status === 'running' ? 'green' : c.status === 'exited' ? 'red' : 'gray')">
                    {{ c.statusText }}
                  </span>
                </div>
                @if (c.ports.length) {
                  <div class="ports-row">
                    @for (p of c.ports; track p) { <span class="mono small port-tag">{{ p }}</span> }
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <!-- ══ Integrazione Jellyfin ══════════════════════════════ -->
        @if (detail.integration?.type === 'jellyfin') {
          @let jf = asJellyfin(detail.integration);

          @if (jf.error) {
            <div class="card">
              <div class="detail-title"><i class="bi bi-film"></i> Jellyfin</div>
              <div class="error-msg" style="margin:0"><i class="bi bi-exclamation-triangle"></i> {{ jf.error }}</div>
            </div>
          } @else {

            <!-- Statistiche Jellyfin -->
            @if (jf.counts) {
              <div class="section-divider"><span><i class="bi bi-film"></i> Libreria Jellyfin</span></div>

              <div class="grid grid-4">
                <div class="card stat-card">
                  <div class="stat-icon" style="color:#3b82f6"><i class="bi bi-film"></i></div>
                  <div class="stat-val">{{ jf.counts.MovieCount | number }}</div>
                  <div class="stat-label">Film</div>
                </div>
                <div class="card stat-card">
                  <div class="stat-icon" style="color:#a855f7"><i class="bi bi-tv"></i></div>
                  <div class="stat-val">{{ jf.counts.SeriesCount | number }}</div>
                  <div class="stat-label">Serie TV</div>
                </div>
                <div class="card stat-card">
                  <div class="stat-icon" style="color:#22c55e"><i class="bi bi-collection-play"></i></div>
                  <div class="stat-val">{{ jf.counts.EpisodeCount | number }}</div>
                  <div class="stat-label">Episodi</div>
                </div>
                <div class="card stat-card">
                  <div class="stat-icon" style="color:#f59e0b"><i class="bi bi-people-fill"></i></div>
                  <div class="stat-val">{{ jf.users.length }}</div>
                  <div class="stat-label">Utenti</div>
                </div>
              </div>
            }

            <!-- Sessioni attive + utenti -->
            <div class="grid grid-2">

              <!-- Sessioni attive -->
              <div class="card">
                <div class="detail-title">
                  <i class="bi bi-play-circle-fill" style="color:#22c55e"></i>
                  Sessioni attive
                  @if (jf.activeSessions > 0) {
                    <span class="badge badge-green" style="margin-left:6px">{{ jf.activeSessions }}</span>
                  }
                </div>
                @if (jf.sessions.length === 0) {
                  <div class="empty-msg" style="padding:16px 0">Nessuna sessione attiva</div>
                }
                @for (s of jf.sessions; track s.userName) {
                  <div class="session-row">
                    <div>
                      <div style="font-weight:600;font-size:13px"><i class="bi bi-person-fill"></i> {{ s.userName }}</div>
                      <div class="small" style="color:var(--text-muted)">{{ s.client }}</div>
                    </div>
                    @if (s.nowPlaying) {
                      <div class="now-playing">
                        <i class="bi bi-music-note-beamed"></i> {{ s.nowPlaying }}
                      </div>
                    }
                  </div>
                }
              </div>

              <!-- Utenti -->
              <div class="card">
                <div class="detail-title"><i class="bi bi-people-fill"></i> Utenti registrati</div>
                @for (u of jf.users; track u.name) {
                  <div class="user-row">
                    <div style="display:flex;align-items:center;gap:8px">
                      <div class="user-avatar">{{ u.name[0].toUpperCase() }}</div>
                      <div>
                        <div style="font-weight:600;font-size:13px">{{ u.name }}</div>
                        @if (u.isAdmin) { <span class="badge badge-yellow" style="font-size:10px">Admin</span> }
                      </div>
                    </div>
                    <div class="small text-muted">
                      @if (u.lastActivity) {
                        {{ u.lastActivity | date:'dd/MM/yy HH:mm' }}
                      } @else {
                        Mai acceduto
                      }
                    </div>
                  </div>
                }
              </div>

            </div>

            <!-- Film aggiunti di recente -->
            @if (jf.recentMovies.length > 0) {
              <div class="card">
                <div class="detail-title"><i class="bi bi-film" style="color:#3b82f6"></i> Film aggiunti di recente</div>
                <div class="media-grid">
                  @for (m of jf.recentMovies; track m.name) {
                    <div class="media-card">
                      <div class="media-name">{{ m.name }}</div>
                      <div class="media-meta">
                        @if (m.year) { <span>{{ m.year }}</span> }
                        @if (m.durationMin) { <span>{{ m.durationMin }} min</span> }
                      </div>
                      @if (m.overview) {
                        <div class="media-overview">{{ m.overview }}</div>
                      }
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Serie aggiunte di recente -->
            @if (jf.recentSeries.length > 0) {
              <div class="card">
                <div class="detail-title"><i class="bi bi-tv" style="color:#a855f7"></i> Serie TV aggiunte di recente</div>
                <div class="media-grid">
                  @for (s of jf.recentSeries; track s.name) {
                    <div class="media-card">
                      <div class="media-name">{{ s.name }}</div>
                      @if (s.year) { <div class="media-meta"><span>{{ s.year }}</span></div> }
                      @if (s.overview) {
                        <div class="media-overview">{{ s.overview }}</div>
                      }
                    </div>
                  }
                </div>
              </div>
            }

          }
        }

      }
    </div><!-- /page -->
  `,
  styles: [`
    .detail-title {
      font-size: 13px; font-weight: 600; color: var(--text-secondary);
      margin-bottom: 14px; display: flex; align-items: center; gap: 7px;
    }

    /* Info grid */
    .info-grid { display: flex; flex-direction: column; gap: 10px; margin-bottom: 8px; }
    .info-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .info-label { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }
    .description { color: var(--text-secondary); font-size: 13px; margin: 12px 0 0; line-height: 1.6; }
    .volume-row { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
    .mono  { font-family: monospace; font-size: 13px; }
    .small { font-size: 11px; }

    /* Containers */
    .ctr-item { padding: 12px 0; border-bottom: 1px solid var(--border-color); }
    .ctr-item:last-child { border-bottom: none; padding-bottom: 0; }
    .ports-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
    .port-tag { background: var(--bg-hover); padding: 1px 7px; border-radius: 4px; }
    code { background: var(--bg-hover); padding: 1px 5px; border-radius: 3px; font-size: 11px; }

    /* Section divider */
    .section-divider {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 0; border-top: 1px solid var(--border-color);
      font-size: 13px; font-weight: 600; color: var(--text-secondary);
      span { display: flex; align-items: center; gap: 8px; }
    }

    /* Stat cards */
    .stat-card { text-align: center; padding: 20px 12px; }
    .stat-icon { font-size: 28px; margin-bottom: 8px; }
    .stat-val   { font-size: 28px; font-weight: 700; color: var(--text-primary); }
    .stat-label { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

    /* Sessions / Users */
    .session-row {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding: 10px 0; border-bottom: 1px solid var(--border-color);
      &:last-child { border-bottom: none; }
    }
    .now-playing { font-size: 12px; color: var(--accent-green); display: flex; align-items: center; gap: 5px; }

    .user-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 0; border-bottom: 1px solid var(--border-color);
      &:last-child { border-bottom: none; }
    }
    .user-avatar {
      width: 32px; height: 32px; border-radius: 50%;
      background: var(--accent-blue); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 14px; flex-shrink: 0;
    }

    /* Media grid */
    .media-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }
    .media-card {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px;
    }
    .media-name     { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
    .media-meta     { display: flex; gap: 8px; font-size: 11px; color: var(--text-muted); margin-bottom: 6px; }
    .media-overview { font-size: 11px; color: var(--text-muted); line-height: 1.5; }

    /* Criticità */
    .badge-red    { background: rgba(239,68,68,.15);  color: #ef4444; }
    .badge-orange { background: rgba(249,115,22,.15); color: #f97316; }
  `]
})
export class ServiceDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api   = inject(ApiService);

  categoryColor = categoryColor;

  detail: ServiceDetail | null = null;
  loading = true;
  error?: string;

  healthBadge(): string {
    const s = this.detail?.health.status;
    if (s === 'online')  return 'green';
    if (s === 'offline') return 'red';
    return 'gray';
  }

  critBadge(c?: string): string {
    if (c === 'high')   return 'red';
    if (c === 'medium') return 'yellow';
    return 'gray';
  }

  asJellyfin(i: any): JellyfinIntegration {
    return i as JellyfinIntegration;
  }

  ngOnInit(): void {
    const name = this.route.snapshot.paramMap.get('name') ?? '';
    this.api.getServiceDetails(name).subscribe({
      next: (d) => { this.detail = d; this.loading = false; },
      error: () => { this.error = `Impossibile caricare i dettagli per "${name}".`; this.loading = false; }
    });
  }
}
