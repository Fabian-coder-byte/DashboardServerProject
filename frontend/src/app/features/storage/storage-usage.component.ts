import { Component, OnInit, OnDestroy, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import Chart from 'chart.js/auto';
import { ApiService } from '../../core/services/api.service';
import { StorageUsage, StorageArea } from '../../core/models/service.model';
import { formatBytes, progressClass } from '../../core/utils/format.utils';

const AREA_COLORS: Record<string, string> = {
  movies:          '#a855f7',
  tvShows:         '#3b82f6',
  cartoonMovies:   '#ec4899',
  cartoonShows:    '#f97316',
  animeMovies:     '#d946ef',
  animeShows:      '#0ea5e9',
  documentaries:   '#14b8a6',
  photosImmichApp: '#22c55e',
  photosExternal:  '#16a34a',
  photosImport:    '#4ade80',
  documents:       '#06b6d4',
  books:           '#f59e0b',
  comics:          '#6366f1',
  games:           '#eab308',
  downloads:       '#94a3b8',
  backups:         '#ef4444',
};

@Component({
  selector: 'app-storage-usage',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <div class="page">

      <!-- Header -->
      <div class="page-header">
        <div class="flex-between" style="flex-wrap:wrap;gap:12px">
          <div>
            <h1><i class="bi bi-pie-chart-fill"></i> Storage per Servizio</h1>
            <p>Utilizzo dello spazio su {{ mount }} per cartella e applicazione</p>
          </div>
          <div style="display:flex;gap:10px;align-items:center">
            @if (data?.summary?.lastUpdated) {
              <span style="font-size:12px;color:var(--text-muted)">
                <i class="bi bi-clock"></i>
                {{ data!.summary.lastUpdated | date:'HH:mm:ss' }}
                @if (data!.cached) { <span>· cache</span> }
              </span>
            }
            <button class="btn btn-secondary btn-sm" (click)="refresh()" [disabled]="loading || refreshing">
              <i [class]="'bi bi-arrow-clockwise' + (refreshing ? ' spin' : '')"></i>
              Aggiorna
            </button>
          </div>
        </div>
      </div>

      @if (loading) { <div class="loading">Calcolo spazio per cartella...</div> }
      @if (error)   { <div class="error-msg"><i class="bi bi-exclamation-triangle-fill"></i> {{ error }}</div> }

      @if (!loading && data) {

        <!-- Panoramica disco -->
        <div class="card">
          <div class="disk-row">
            <div>
              <div class="disk-label">
                <i class="bi bi-hdd-fill" style="color:var(--accent-blue)"></i>
                {{ data.disk.mount }}
              </div>
              @if (!data.disk.available) {
                <div class="badge badge-yellow mt-8">
                  <i class="bi bi-exclamation-triangle"></i> Mount non disponibile
                </div>
              }
            </div>
            <div class="disk-stats">
              <div class="stat-box">
                <div class="stat-label">Totale</div>
                <div class="stat-value">{{ formatBytes(data.disk.totalBytes) }}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Usato</div>
                <div class="stat-value" style="color:var(--accent-yellow)">{{ formatBytes(data.disk.usedBytes) }}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Libero</div>
                <div class="stat-value" style="color:var(--accent-green)">{{ formatBytes(data.disk.freeBytes) }}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Utilizzo</div>
                <div class="stat-value"
                  [style.color]="data.disk.usedPercent >= 85 ? 'var(--accent-red)' : data.disk.usedPercent >= 70 ? 'var(--accent-yellow)' : 'var(--accent-green)'">
                  {{ data.disk.usedPercent }}%
                </div>
              </div>
            </div>
          </div>

          <div class="progress-bar" style="height:10px;margin-top:16px;margin-bottom:8px">
            <div class="progress-bar__fill" [class]="progressClass(data.disk.usedPercent)" [style.width.%]="data.disk.usedPercent"></div>
          </div>

          <div style="font-size:12px;color:var(--text-muted);display:flex;gap:16px;flex-wrap:wrap">
            <span>Aree mappate: <strong style="color:var(--text-secondary)">{{ data.summary.knownAreasFormatted }}</strong></span>
            <span>Altro/Sistema: <strong style="color:var(--text-secondary)">{{ data.summary.otherFormatted }}</strong></span>
            @if (data.summary.largestArea) {
              <span>Area più grande: <strong style="color:var(--text-secondary)">{{ data.summary.largestArea }}</strong></span>
            }
          </div>
        </div>

        <!-- Grafici -->
        <div class="grid grid-2">

          <!-- Donut chart -->
          <div class="card">
            <div class="section-title mb-16">
              <i class="bi bi-pie-chart"></i> Distribuzione spazio
            </div>
            <div style="height:220px;position:relative">
              <canvas #donutCanvas></canvas>
            </div>
            <div class="legend">
              @for (area of data.areas; track area.key) {
                @if (area.exists && area.sizeBytes > 0) {
                  <div class="legend-row">
                    <span class="legend-dot" [style.background]="areaColor(area.key)"></span>
                    <span class="legend-name">{{ area.label }}</span>
                    <span class="legend-size">{{ area.sizeFormatted }}</span>
                    <span class="legend-pct">{{ area.percentOfDisk }}%</span>
                  </div>
                }
              }
              @if (data.summary.otherBytes > 0) {
                <div class="legend-row">
                  <span class="legend-dot" style="background:#475569"></span>
                  <span class="legend-name">Altro</span>
                  <span class="legend-size">{{ data.summary.otherFormatted }}</span>
                  <span class="legend-pct">{{ otherPct() }}%</span>
                </div>
              }
            </div>
          </div>

          <!-- Bar chart -->
          <div class="card">
            <div class="section-title mb-16">
              <i class="bi bi-bar-chart-horizontal"></i> Classifica per dimensione
            </div>
            <div [style.height.px]="barChartHeight()" style="position:relative">
              <canvas #barCanvas></canvas>
            </div>
          </div>
        </div>

        <!-- Card aree -->
        <div>
          <div class="section-title mb-16">
            <i class="bi bi-grid"></i> Dettaglio aree
          </div>
          <div class="grid grid-3">
            @for (area of data.areas; track area.key) {
              <div class="card area-card" [class.area-missing]="!area.exists">
                <div class="area-header">
                  <div class="area-icon"
                    [style.background]="areaColor(area.key) + '22'"
                    [style.color]="areaColor(area.key)">
                    <i [class]="'bi bi-' + area.icon"></i>
                  </div>
                  <div style="flex:1;min-width:0">
                    <div class="area-name">{{ area.label }}</div>
                    <div class="area-service">{{ area.service }}</div>
                  </div>
                  @if (!area.exists) {
                    <span class="badge badge-gray">N/D</span>
                  }
                </div>

                @if (area.exists) {
                  <div class="area-size">{{ area.sizeFormatted }}</div>

                  <div class="progress-bar" style="height:5px;margin:10px 0">
                    <div [style.width.%]="areaBarWidth(area)"
                         [style.background]="areaColor(area.key)"
                         style="height:100%;border-radius:3px;transition:width .5s ease">
                    </div>
                  </div>

                  <div class="area-meta">
                    <span><i class="bi bi-pie-chart"></i> {{ area.percentOfDisk }}% del disco</span>
                    <span style="display:flex;gap:8px">
                      @if (area.folderCount > 0) {
                        <span><i class="bi bi-folder"></i> {{ area.folderCount }}</span>
                      }
                      @if (area.fileCount > 0) {
                        <span><i class="bi bi-file"></i> {{ area.fileCount }}</span>
                      }
                    </span>
                  </div>
                } @else {
                  <div class="area-path">{{ area.path }}</div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:6px">Cartella non trovata</div>
                }
              </div>
            }
          </div>
        </div>

      }
    </div>
  `,
  styles: [`
    .disk-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
    }
    .disk-label {
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .disk-stats {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
    }
    .stat-box { text-align: right; }
    .stat-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px; }
    .stat-value { font-size: 18px; font-weight: 700; margin-top: 2px; }

    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: .5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .legend {
      margin-top: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 220px;
      overflow-y: auto;
    }
    .legend-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .legend-dot   { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .legend-name  { flex: 1; color: var(--text-secondary); }
    .legend-size  { font-size: 11px; color: var(--text-muted); }
    .legend-pct   { font-weight: 600; color: var(--text-secondary); min-width: 38px; text-align: right; }

    .area-card    { display: flex; flex-direction: column; }
    .area-missing { opacity: .55; }
    .area-header  { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .area-icon    { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
    .area-name    { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .area-service { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .area-size    { font-size: 22px; font-weight: 700; line-height: 1; }
    .area-meta    { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-muted); margin-top: 8px; gap: 8px; flex-wrap: wrap; }
    .area-path    { font-family: monospace; font-size: 11px; color: var(--text-muted); margin-top: 8px; word-break: break-all; }

    .spin { animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 640px) {
      .disk-stats { gap: 14px; }
      .stat-value { font-size: 15px; }
    }
  `]
})
export class StorageUsageComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  protected Math = Math;

  data: StorageUsage | null = null;
  loading    = true;
  refreshing = false;
  error?: string;

  readonly mount = '/mnt/storage1';

  @ViewChild('donutCanvas') private donutRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('barCanvas')   private barRef?:   ElementRef<HTMLCanvasElement>;

  private donutChart?: Chart;
  private barChart?:   Chart;

  formatBytes   = formatBytes;
  progressClass = progressClass;

  ngOnInit()    { this.loadData(); }
  ngOnDestroy() { this.donutChart?.destroy(); this.barChart?.destroy(); }

  areaColor(key: string): string {
    return AREA_COLORS[key] ?? '#475569';
  }

  otherPct(): string {
    if (!this.data?.disk.totalBytes) return '0';
    return ((this.data.summary.otherBytes / this.data.disk.totalBytes) * 100).toFixed(1);
  }

  barChartHeight(): number {
    const count = this.data?.areas.filter(a => a.exists && a.sizeBytes > 0).length ?? 5;
    return Math.max(200, count * 38);
  }

  // Width relative to total used space so bars are visually proportional.
  areaBarWidth(area: StorageArea): number {
    if (!this.data?.disk.usedBytes || !area.sizeBytes) return 0;
    return Math.min(Math.round((area.sizeBytes / this.data.disk.usedBytes) * 100), 100);
  }

  refresh() {
    this.refreshing = true;
    this.loadData(true);
  }

  private loadData(forceRefresh = false) {
    if (!forceRefresh) this.loading = true;
    this.error = undefined;

    this.api.getStorageUsage(forceRefresh).subscribe({
      next: data => {
        this.data      = data;
        this.loading   = false;
        this.refreshing = false;
        setTimeout(() => this.buildCharts(), 50);
      },
      error: err => {
        this.error     = err.error?.error ?? 'Errore nel caricamento dati storage';
        this.loading   = false;
        this.refreshing = false;
      }
    });
  }

  private buildCharts() {
    if (!this.data || !this.donutRef?.nativeElement || !this.barRef?.nativeElement) return;

    const existing   = this.data.areas.filter(a => a.exists && a.sizeBytes > 0);
    const otherBytes = this.data.summary.otherBytes;

    // Doughnut
    const dLabels = [...existing.map(a => a.label), ...(otherBytes > 0 ? ['Altro'] : [])];
    const dData   = [...existing.map(a => a.sizeBytes), ...(otherBytes > 0 ? [otherBytes] : [])];
    const dColors = [...existing.map(a => this.areaColor(a.key)), ...(otherBytes > 0 ? ['#475569'] : [])];

    this.donutChart?.destroy();
    this.donutChart = new Chart(this.donutRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels:   dLabels,
        datasets: [{ data: dData, backgroundColor: dColors, borderColor: '#1e2130', borderWidth: 2, hoverOffset: 8 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const bytes = ctx.raw as number;
                const pct   = this.data!.disk.totalBytes > 0
                  ? ((bytes / this.data!.disk.totalBytes) * 100).toFixed(1) : '0';
                return ` ${formatBytes(bytes)} (${pct}%)`;
              }
            }
          }
        }
      }
    });

    // Horizontal bar — sorted largest first
    const sorted = [...existing].sort((a, b) => b.sizeBytes - a.sizeBytes);

    this.barChart?.destroy();
    this.barChart = new Chart(this.barRef.nativeElement, {
      type: 'bar',
      data: {
        labels:   sorted.map(a => a.label),
        datasets: [{
          data:            sorted.map(a => a.sizeBytes),
          backgroundColor: sorted.map(a => this.areaColor(a.key) + 'bb'),
          borderColor:     sorted.map(a => this.areaColor(a.key)),
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => ` ${formatBytes(ctx.raw as number)}` }
          }
        },
        scales: {
          x: {
            grid:  { color: 'rgba(45,49,72,0.5)' },
            ticks: { color: '#64748b', callback: (v) => formatBytes(v as number) }
          },
          y: {
            grid:  { display: false },
            ticks: { color: '#94a3b8', font: { size: 12 } }
          }
        }
      }
    });
  }
}
