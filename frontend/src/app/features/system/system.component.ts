import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import Chart, { ChartConfiguration } from 'chart.js/auto';
import { ApiService } from '../../core/services/api.service';
import { MetricSample, SystemSpecs } from '../../core/models/system.model';
import { Container } from '../../core/models/docker.model';
import { formatBytes } from '../../core/utils/format.utils';

interface ContainerStat {
  name:     string;
  cpuPct:   number;
  ramBytes: number;
  ramPct:   number;
}

interface ProcessStat {
  name: string;
  cpu:  number;
  mem:  number;
}

@Component({
  selector: 'app-system',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
    <div class="page-header">
      <h1><i class="bi bi-cpu-fill"></i> Sistema</h1>
      <p>Risorse hardware e andamento nel tempo — aggiornamento ogni 5 s</p>
    </div>

    <!-- Specifiche hardware -->
    @if (specs) {
      <div class="card specs-card">
        <div class="specs-title"><i class="bi bi-motherboard"></i> Specifiche Hardware</div>
        <div class="specs-grid">
          <div class="spec-item">
            <div class="spec-label">Modello</div>
            <div class="spec-value">{{ specs.system.model || 'N/D' }}</div>
          </div>
          <div class="spec-item">
            <div class="spec-label">CPU</div>
            <div class="spec-value">{{ specs.cpu.brand }} · {{ specs.cpu.physicalCores }} core · {{ specs.cpu.speed }} GHz</div>
          </div>
          <div class="spec-item">
            <div class="spec-label">RAM totale</div>
            <div class="spec-value">{{ fmtBytes(specs.ram.total) }}</div>
          </div>
          <div class="spec-item">
            <div class="spec-label">Sistema operativo</div>
            <div class="spec-value">{{ specs.os.distro }} {{ specs.os.release }}</div>
          </div>
          <div class="spec-item">
            <div class="spec-label">Kernel</div>
            <div class="spec-value">{{ specs.os.kernel }}</div>
          </div>
          <div class="spec-item">
            <div class="spec-label">Architettura</div>
            <div class="spec-value">{{ specs.os.arch }}</div>
          </div>
        </div>
      </div>
    }

    <!-- Grafici principali: CPU · RAM · Temperatura -->
    <div class="grid grid-3">

      <div class="card chart-card">
        <div class="chart-header">
          <div>
            <div class="chart-label">CPU</div>
            <div class="chart-big-value" [class]="valueClass(current.cpu, 60, 85)">{{ current.cpu }}%</div>
          </div>
          <i class="bi bi-cpu" style="color:#3b82f6;font-size:22px"></i>
        </div>
        <div class="chart-area"><canvas #cpuCanvas></canvas></div>
      </div>

      <div class="card chart-card">
        <div class="chart-header">
          <div>
            <div class="chart-label">RAM</div>
            <div class="chart-big-value" [class]="valueClass(current.ram, 60, 85)">{{ current.ram }}%</div>
          </div>
          <i class="bi bi-memory" style="color:#22c55e;font-size:22px"></i>
        </div>
        <div class="chart-area"><canvas #ramCanvas></canvas></div>
      </div>

      <div class="card chart-card">
        <div class="chart-header">
          <div>
            <div class="chart-label">Temperatura CPU</div>
            <div class="chart-big-value" [class]="valueClass(current.temp ?? 0, 60, 75)">
              {{ current.temp !== null ? current.temp + '°C' : 'N/D' }}
            </div>
          </div>
          <i class="bi bi-thermometer-half" style="color:#f59e0b;font-size:22px"></i>
        </div>
        <div class="chart-area"><canvas #tempCanvas></canvas></div>
      </div>
    </div>

    <!-- Grafico rete -->
    <div class="card chart-card">
      <div class="chart-header">
        <div>
          <div class="chart-label">Traffico di rete</div>
          <div style="display:flex;gap:16px;margin-top:4px">
            <span style="color:#06b6d4;font-size:13px;font-weight:600">
              <i class="bi bi-arrow-down"></i> {{ fmtBytes(current.netRx) }}/s
            </span>
            <span style="color:#a855f7;font-size:13px;font-weight:600">
              <i class="bi bi-arrow-up"></i> {{ fmtBytes(current.netTx) }}/s
            </span>
          </div>
        </div>
        <i class="bi bi-activity" style="color:#06b6d4;font-size:22px"></i>
      </div>
      <div class="chart-area chart-area--wide"><canvas #netCanvas></canvas></div>
    </div>

    <!-- Carico per core -->
    @if (coreLoads.length > 0) {
      <div class="card">
        <div class="section-title">Carico per core</div>
        <div class="cores-grid">
          @for (load of coreLoads; track $index) {
            <div class="core-row">
              <span class="core-label">Core {{ $index }}</span>
              <div class="core-track">
                <div class="core-fill" [class]="valueClass(load, 60, 85)"
                     [style.width.%]="load"></div>
              </div>
              <span class="core-pct">{{ load }}%</span>
            </div>
          }
        </div>
      </div>
    }

    <!-- ══════════════════════════════════════════════════════════ -->
    <!--  Utilizzo risorse per container                           -->
    <!-- ══════════════════════════════════════════════════════════ -->
    @if (containerStats.length > 0) {

      <div class="section-divider">
        <span><i class="bi bi-box-seam-fill"></i> Risorse per container</span>
        <span class="badge badge-gray">{{ containerStats.length }} in esecuzione</span>
      </div>

      <!-- Bar chart CPU + RAM affiancati -->
      <div class="grid grid-2">
        <div class="card">
          <div class="section-title"><i class="bi bi-cpu" style="color:#3b82f6"></i> CPU per container</div>
          <div [style.height.px]="barHeight()"><canvas #cpuBarCanvas></canvas></div>
        </div>
        <div class="card">
          <div class="section-title"><i class="bi bi-memory" style="color:#22c55e"></i> RAM per container</div>
          <div [style.height.px]="barHeight()"><canvas #ramBarCanvas></canvas></div>
        </div>
      </div>

      <!-- Tabella dettaglio con doppie barre -->
      <div class="card">
        <div class="section-title">Dettaglio completo</div>
        <div class="ctr-table">
          <div class="ctr-head">
            <span>Container</span>
            <span>CPU</span>
            <span>RAM</span>
          </div>
          @for (c of containersByCpu; track c.name) {
            <div class="ctr-row">
              <span class="ctr-name">{{ c.name }}</span>

              <div class="ctr-cell">
                <div class="ctr-track">
                  <div class="ctr-fill" [class]="valueClass(c.cpuPct, 30, 70)"
                       [style.width.%]="c.cpuPct"></div>
                </div>
                <span class="ctr-val">{{ c.cpuPct }}%</span>
              </div>

              <div class="ctr-cell">
                <div class="ctr-track">
                  <div class="ctr-fill" [class]="valueClass(c.ramPct, 50, 80)"
                       [style.width.%]="c.ramPct"></div>
                </div>
                <span class="ctr-val">{{ fmtBytes(c.ramBytes) }}</span>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Top processi di sistema -->
      @if (topProcesses.length > 0) {
        <div class="card">
          <div class="section-title"><i class="bi bi-list-task"></i> Top processi di sistema</div>
          <div class="ctr-table">
            <div class="ctr-head">
              <span>Processo</span>
              <span>CPU</span>
              <span>RAM</span>
            </div>
            @for (p of topProcesses; track p.name + p.cpu) {
              <div class="ctr-row">
                <span class="ctr-name">{{ p.name }}</span>

                <div class="ctr-cell">
                  <div class="ctr-track">
                    <div class="ctr-fill" [class]="valueClass(p.cpu, 10, 30)"
                         [style.width.%]="Math.min(p.cpu, 100)"></div>
                  </div>
                  <span class="ctr-val">{{ p.cpu }}%</span>
                </div>

                <div class="ctr-cell">
                  <div class="ctr-track">
                    <div class="ctr-fill" [class]="valueClass(p.mem, 5, 15)"
                         [style.width.%]="Math.min(p.mem * 5, 100)"></div>
                  </div>
                  <span class="ctr-val">{{ p.mem }}%</span>
                </div>
              </div>
            }
          </div>
        </div>
      }
    }
    </div><!-- /page -->
  `,
  styles: [`
    /* ── Specs ─────────────────────────────────────────────────── */
    .specs-title {
      font-size: 13px; font-weight: 600; color: var(--text-secondary);
      margin-bottom: 16px; display: flex; align-items: center; gap: 8px;
    }
    .specs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px 24px;
    }
    .spec-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3px; }
    .spec-value { font-size: 13px; font-weight: 500; color: var(--text-primary); }

    /* ── Line charts ────────────────────────────────────────────── */
    .chart-card { display: flex; flex-direction: column; }
    .chart-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .chart-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 2px; }
    .chart-big-value { font-size: 24px; font-weight: 700; line-height: 1; }
    .chart-area { flex: 1; height: 130px; }
    .chart-area--wide { height: 160px; }

    /* ── Colori soglia ─────────────────────────────────────────── */
    .ok      { color: #22c55e; }
    .warning { color: #f59e0b; }
    .danger  { color: #ef4444; }

    /* ── Core bars ─────────────────────────────────────────────── */
    .section-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
    .cores-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
    .core-row { display: flex; align-items: center; gap: 10px; }
    .core-label { font-size: 12px; color: var(--text-muted); width: 48px; flex-shrink: 0; }
    .core-track { flex: 1; height: 6px; background: var(--bg-hover); border-radius: 3px; overflow: hidden; }
    .core-fill { height: 100%; border-radius: 3px; transition: width .4s ease; }
    .core-fill.ok      { background: #22c55e; }
    .core-fill.warning { background: #f59e0b; }
    .core-fill.danger  { background: #ef4444; }
    .core-pct { font-size: 12px; font-weight: 600; color: var(--text-secondary); width: 36px; text-align: right; flex-shrink: 0; }

    /* ── Sezione container ─────────────────────────────────────── */
    .section-divider {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 0;
      border-top: 1px solid var(--border-color);
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      span:first-child { display: flex; align-items: center; gap: 8px; }
    }

    /* ── Tabella container/processi ────────────────────────────── */
    .ctr-table { display: flex; flex-direction: column; gap: 2px; }
    .ctr-head {
      display: grid;
      grid-template-columns: 160px 1fr 1fr;
      padding: 4px 6px 8px;
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: .5px;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 4px;
    }
    .ctr-row {
      display: grid;
      grid-template-columns: 160px 1fr 1fr;
      align-items: center;
      gap: 10px;
      padding: 5px 6px;
      border-radius: 6px;
      transition: background .12s;
      &:hover { background: var(--bg-hover); }
    }
    .ctr-name { font-size: 13px; font-weight: 500; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ctr-cell { display: flex; align-items: center; gap: 8px; }
    .ctr-track { flex: 1; height: 6px; background: var(--bg-hover); border-radius: 3px; overflow: hidden; min-width: 60px; }
    .ctr-fill { height: 100%; border-radius: 3px; transition: width .5s ease; }
    .ctr-fill.ok      { background: #22c55e; }
    .ctr-fill.warning { background: #f59e0b; }
    .ctr-fill.danger  { background: #ef4444; }
    .ctr-val { font-size: 12px; font-weight: 600; color: var(--text-secondary); white-space: nowrap; min-width: 52px; text-align: right; }
  `]
})
export class SystemComponent implements OnInit, AfterViewInit, OnDestroy {
  private api = inject(ApiService);

  protected Math = Math;

  specs: SystemSpecs | null = null;
  coreLoads: number[] = [];
  containerStats:  ContainerStat[] = [];
  containersByCpu: ContainerStat[] = [];
  topProcesses: ProcessStat[] = [];

  current = { cpu: 0, ram: 0, temp: null as number | null, netRx: 0, netTx: 0 };
  private totalRam = 0;

  fmtBytes = formatBytes;

  // ── Line chart refs ──────────────────────────────────────────────
  @ViewChild('cpuCanvas')  private cpuRef!:  ElementRef<HTMLCanvasElement>;
  @ViewChild('ramCanvas')  private ramRef!:  ElementRef<HTMLCanvasElement>;
  @ViewChild('tempCanvas') private tempRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('netCanvas')  private netRef!:  ElementRef<HTMLCanvasElement>;

  // ── Bar chart refs ───────────────────────────────────────────────
  @ViewChild('cpuBarCanvas') private cpuBarRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('ramBarCanvas') private ramBarRef?: ElementRef<HTMLCanvasElement>;

  private cpuChart?:    Chart;
  private ramChart?:    Chart;
  private tempChart?:   Chart;
  private netChart?:    Chart;
  private cpuBarChart?: Chart;
  private ramBarChart?: Chart;

  private labels:    string[]          = [];
  private cpuData:   (number | null)[] = [];
  private ramData:   (number | null)[] = [];
  private tempData:  (number | null)[] = [];
  private netRxData: (number | null)[] = [];
  private netTxData: (number | null)[] = [];

  private pollTimer?: ReturnType<typeof setInterval>;

  // ── Public helpers ───────────────────────────────────────────────

  valueClass(val: number, warn: number, danger: number): string {
    if (val >= danger) return 'danger';
    if (val >= warn)   return 'warning';
    return 'ok';
  }

  barHeight(): number {
    return Math.max(160, this.containerStats.length * 34);
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  ngOnInit(): void {
    this.api.getSystemSpecs().subscribe({
      next: s => {
        this.specs = s;
        this.totalRam = s.ram.total;
      }
    });
  }

  ngAfterViewInit(): void {
    this.createLineCharts();

    this.api.getSystemHistory().subscribe({
      next: (history) => { history.forEach(s => this.pushSample(s)); this.updateLineCharts(); }
    });

    this.startPolling();
  }

  ngOnDestroy(): void {
    clearInterval(this.pollTimer);
    [this.cpuChart, this.ramChart, this.tempChart, this.netChart,
     this.cpuBarChart, this.ramBarChart].forEach(c => c?.destroy());
  }

  // ── Polling ──────────────────────────────────────────────────────

  private startPolling(): void {
    const poll = () => {
      this.api.getSystemOverview().subscribe({
        next: (o) => {
          this.current = {
            cpu:   o.cpuUsage,
            ram:   o.ram.usedPercent,
            temp:  o.temperature,
            netRx: o.network.reduce((s, n) => s + n.rxSec, 0),
            netTx: o.network.reduce((s, n) => s + n.txSec, 0)
          };
          if (!this.totalRam) this.totalRam = o.ram.total;
          this.pushSample({ t: Math.floor(Date.now() / 1000), ...this.current });
          this.updateLineCharts();
        }
      });

      this.api.getSystemCpu().subscribe({
        next: (c) => this.coreLoads = c.coresLoad ?? []
      });

      this.api.getContainers().subscribe({
        next: (containers) => this.processContainers(containers)
      });

      this.api.getSystemProcesses().subscribe({
        next: (data) => this.topProcesses = data.top.slice(0, 8)
      });
    };

    poll();
    this.pollTimer = setInterval(poll, 5000);
  }

  // ── Container data ───────────────────────────────────────────────

  private processContainers(containers: Container[]): void {
    const running = containers.filter(c => c.status === 'running' && c.cpuUsage !== null);
    const ram = this.totalRam || 1;

    this.containerStats = running.map(c => ({
      name:     c.name,
      cpuPct:   c.cpuUsage ?? 0,
      ramBytes: c.memoryUsage ?? 0,
      ramPct:   Math.round(((c.memoryUsage ?? 0) / ram) * 100 * 10) / 10
    }));

    this.containersByCpu = [...this.containerStats].sort((a, b) => b.cpuPct - a.cpuPct);

    this.updateBarCharts();
  }

  private updateBarCharts(): void {
    if (!this.containerStats.length) return;

    // Crea i bar chart la prima volta che ci sono dati, poi aggiorna
    if (!this.cpuBarChart && this.cpuBarRef) this.createBarCharts();
    if (!this.cpuBarChart || !this.ramBarChart) return;

    const byCpu = [...this.containerStats].sort((a, b) => b.cpuPct - a.cpuPct);
    const byRam = [...this.containerStats].sort((a, b) => b.ramPct - a.ramPct);

    const cpuColors = byCpu.map(c =>
      c.cpuPct >= 70 ? '#ef4444' : c.cpuPct >= 30 ? '#f59e0b' : '#3b82f6'
    );
    const ramColors = byRam.map(c =>
      c.ramPct >= 70 ? '#ef4444' : c.ramPct >= 50 ? '#f59e0b' : '#22c55e'
    );

    this.cpuBarChart.data.labels              = byCpu.map(c => c.name);
    this.cpuBarChart.data.datasets[0].data    = byCpu.map(c => c.cpuPct);
    (this.cpuBarChart.data.datasets[0] as any).backgroundColor = cpuColors;
    this.cpuBarChart.update('none');

    this.ramBarChart.data.labels              = byRam.map(c => c.name);
    this.ramBarChart.data.datasets[0].data    = byRam.map(c => c.ramPct);
    (this.ramBarChart.data.datasets[0] as any).backgroundColor = ramColors;
    // Tooltip personalizzato che mostra bytes reali
    const byteMap = Object.fromEntries(byRam.map(c => [c.name, c.ramBytes]));
    (this.ramBarChart.options as any).plugins.tooltip.callbacks.label =
      (ctx: any) => ` ${ctx.parsed.x}%  (${formatBytes(byteMap[ctx.label] ?? 0)})`;
    this.ramBarChart.update('none');
  }

  // ── Chart creation ───────────────────────────────────────────────

  private createLineCharts(): void {
    const grid = 'rgba(255,255,255,0.05)';
    const tick = '#6b7280';
    const xAxis = {
      ticks: { color: tick, maxTicksLimit: 5, font: { size: 10 } },
      grid:  { color: grid }
    };

    const makeLineCfg = (
      color: string, yMax: number, suffix: string
    ): ChartConfiguration<'line', (number | null)[], string> => ({
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [], borderColor: color, backgroundColor: color + '1a',
          borderWidth: 1.5, fill: true, tension: 0.3, pointRadius: 0, spanGaps: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: xAxis,
          y: { min: 0, max: yMax, ticks: { color: tick, font: { size: 10 }, callback: v => v + suffix }, grid: { color: grid } }
        }
      }
    });

    this.cpuChart  = new Chart(this.cpuRef.nativeElement,  makeLineCfg('#3b82f6', 100, '%'));
    this.ramChart  = new Chart(this.ramRef.nativeElement,  makeLineCfg('#22c55e', 100, '%'));
    this.tempChart = new Chart(this.tempRef.nativeElement, makeLineCfg('#f59e0b',  90, '°'));

    const netCfg: ChartConfiguration<'line', (number | null)[], string> = {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: '↓ RX', data: [], borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.1)',   borderWidth: 1.5, fill: true, tension: 0.3, pointRadius: 0, spanGaps: true },
          { label: '↑ TX', data: [], borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.08)', borderWidth: 1.5, fill: true, tension: 0.3, pointRadius: 0, spanGaps: true }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: true, labels: { color: '#9ca3af', boxWidth: 12, font: { size: 11 } } } },
        scales: {
          x: xAxis,
          y: { min: 0, ticks: { color: tick, font: { size: 10 }, callback: v => formatBytes(Number(v)) + '/s' }, grid: { color: grid } }
        }
      }
    };
    this.netChart = new Chart(this.netRef.nativeElement, netCfg);
  }

  private createBarCharts(): void {
    if (!this.cpuBarRef || !this.ramBarRef) return;

    const grid = 'rgba(255,255,255,0.05)';
    const tick = '#6b7280';

    const makeBarCfg = (
      xMax: number, suffix: string
    ): ChartConfiguration<'bar', number[], string> => ({
      type: 'bar',
      data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderRadius: 4, borderWidth: 0 }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.x}${suffix}` } }
        },
        scales: {
          x: {
            min: 0, max: xMax,
            ticks: { color: tick, font: { size: 10 }, callback: v => v + suffix },
            grid: { color: grid }
          },
          y: {
            ticks: { color: '#d1d5db', font: { size: 11 } },
            grid: { color: grid }
          }
        }
      }
    });

    this.cpuBarChart = new Chart(this.cpuBarRef.nativeElement, makeBarCfg(100, '%'));
    this.ramBarChart = new Chart(this.ramBarRef.nativeElement, makeBarCfg(100, '%'));
  }

  // ── Line chart helpers ───────────────────────────────────────────

  private pushSample(s: MetricSample): void {
    const d = new Date(s.t * 1000);
    this.labels.push(d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    this.cpuData.push(s.cpu);
    this.ramData.push(s.ram);
    this.tempData.push(s.temp);
    this.netRxData.push(s.netRx);
    this.netTxData.push(s.netTx);

    const MAX = 60;
    if (this.labels.length > MAX) {
      this.labels.shift(); this.cpuData.shift(); this.ramData.shift();
      this.tempData.shift(); this.netRxData.shift(); this.netTxData.shift();
    }
  }

  private updateLineCharts(): void {
    const set = (chart: Chart | undefined, ...datasets: (number | null)[][]) => {
      if (!chart) return;
      chart.data.labels = [...this.labels];
      datasets.forEach((d, i) => chart.data.datasets[i].data = [...d]);
      chart.update('none');
    };
    set(this.cpuChart,  this.cpuData);
    set(this.ramChart,  this.ramData);
    set(this.tempChart, this.tempData);
    set(this.netChart,  this.netRxData, this.netTxData);
  }
}
