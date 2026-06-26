import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import Chart from 'chart.js/auto';
import { ApiService } from '../../core/services/api.service';
import { MetricSample, SystemSpecs } from '../../core/models/system.model';
import { formatBytes } from '../../core/utils/format.utils';

@Component({
  selector: 'app-system',
  standalone: true,
  imports: [CommonModule],
  template: `
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
  `,
  styles: [`
    .specs-card {
      margin-bottom: 0;
    }
    .specs-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .specs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px 24px;
    }
    .spec-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: .5px;
      margin-bottom: 3px;
    }
    .spec-value {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .chart-card { display: flex; flex-direction: column; }
    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .chart-label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: .5px;
      margin-bottom: 2px;
    }
    .chart-big-value {
      font-size: 24px;
      font-weight: 700;
      line-height: 1;
    }
    .chart-area { flex: 1; height: 130px; }
    .chart-area--wide { height: 160px; }

    /* Colori valori in base alla soglia */
    .ok      { color: #22c55e; }
    .warning { color: #f59e0b; }
    .danger  { color: #ef4444; }

    /* Barre per core */
    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 14px;
    }
    .cores-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 10px;
    }
    .core-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .core-label {
      font-size: 12px;
      color: var(--text-muted);
      width: 48px;
      flex-shrink: 0;
    }
    .core-track {
      flex: 1;
      height: 6px;
      background: var(--bg-hover);
      border-radius: 3px;
      overflow: hidden;
    }
    .core-fill {
      height: 100%;
      border-radius: 3px;
      transition: width .4s ease;
    }
    .core-fill.ok      { background: #22c55e; }
    .core-fill.warning { background: #f59e0b; }
    .core-fill.danger  { background: #ef4444; }
    .core-pct {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      width: 36px;
      text-align: right;
      flex-shrink: 0;
    }
  `]
})
export class SystemComponent implements OnInit, AfterViewInit, OnDestroy {
  private api = inject(ApiService);

  specs: SystemSpecs | null = null;
  coreLoads: number[] = [];
  current = { cpu: 0, ram: 0, temp: null as number | null, netRx: 0, netTx: 0 };

  fmtBytes = formatBytes;

  @ViewChild('cpuCanvas')  private cpuRef!:  ElementRef<HTMLCanvasElement>;
  @ViewChild('ramCanvas')  private ramRef!:  ElementRef<HTMLCanvasElement>;
  @ViewChild('tempCanvas') private tempRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('netCanvas')  private netRef!:  ElementRef<HTMLCanvasElement>;

  private cpuChart?: Chart;
  private ramChart?: Chart;
  private tempChart?: Chart;
  private netChart?: Chart;

  private labels:    string[]           = [];
  private cpuData:   (number | null)[]  = [];
  private ramData:   (number | null)[]  = [];
  private tempData:  (number | null)[]  = [];
  private netRxData: (number | null)[]  = [];
  private netTxData: (number | null)[]  = [];

  private pollTimer?: ReturnType<typeof setInterval>;

  valueClass(val: number, warn: number, danger: number): string {
    if (val >= danger) return 'danger';
    if (val >= warn)   return 'warning';
    return 'ok';
  }

  ngOnInit(): void {
    this.api.getSystemSpecs().subscribe({ next: s => this.specs = s });
  }

  ngAfterViewInit(): void {
    this.createCharts();

    this.api.getSystemHistory().subscribe({
      next: (history) => {
        history.forEach(s => this.pushSample(s));
        this.updateCharts();
      }
    });

    this.startPolling();
  }

  ngOnDestroy(): void {
    clearInterval(this.pollTimer);
    [this.cpuChart, this.ramChart, this.tempChart, this.netChart].forEach(c => c?.destroy());
  }

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
      this.labels.shift();
      this.cpuData.shift();
      this.ramData.shift();
      this.tempData.shift();
      this.netRxData.shift();
      this.netTxData.shift();
    }
  }

  private updateCharts(): void {
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
          this.pushSample({ t: Math.floor(Date.now() / 1000), ...this.current });
          this.updateCharts();
        }
      });

      this.api.getSystemCpu().subscribe({
        next: (c) => this.coreLoads = c.coresLoad ?? []
      });
    };

    poll();
    this.pollTimer = setInterval(poll, 5000);
  }

  private createCharts(): void {
    const grid  = 'rgba(255,255,255,0.05)';
    const tick  = '#6b7280';
    const xAxis = {
      ticks: { color: tick, maxTicksLimit: 5, font: { size: 10 } },
      grid:  { color: grid }
    };
    const pctY = {
      min: 0, max: 100,
      ticks: { color: tick, font: { size: 10 }, callback: (v: number | string) => v + '%' },
      grid: { color: grid }
    };
    const line = (color: string) => ({
      type: 'line' as const,
      data: { labels: [] as string[], datasets: [{ data: [] as (number | null)[], borderColor: color,
        backgroundColor: color.replace(')', ',0.1)').replace('rgb', 'rgba'),
        borderWidth: 1.5, fill: true, tension: 0.3, pointRadius: 0, spanGaps: true }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false } },
        scales: { x: xAxis, y: pctY }
      }
    });

    this.cpuChart  = new Chart(this.cpuRef.nativeElement,  line('#3b82f6'));
    this.ramChart  = new Chart(this.ramRef.nativeElement,  line('#22c55e'));

    // Temperatura: scala 0–90°C
    const tempCfg = line('#f59e0b');
    (tempCfg.options.scales.y as any).max = 90;
    (tempCfg.options.scales.y as any).ticks.callback = (v: number | string) => v + '°';
    this.tempChart = new Chart(this.tempRef.nativeElement, tempCfg);

    // Rete: scala automatica, due dataset
    this.netChart = new Chart(this.netRef.nativeElement, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: '↓ RX', data: [], borderColor: '#06b6d4',
            backgroundColor: 'rgba(6,182,212,0.1)',  borderWidth: 1.5, fill: true, tension: 0.3, pointRadius: 0, spanGaps: true },
          { label: '↑ TX', data: [], borderColor: '#a855f7',
            backgroundColor: 'rgba(168,85,247,0.08)', borderWidth: 1.5, fill: true, tension: 0.3, pointRadius: 0, spanGaps: true }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: true, labels: { color: '#9ca3af', boxWidth: 12, font: { size: 11 } } } },
        scales: {
          x: xAxis,
          y: {
            min: 0,
            ticks: { color: tick, font: { size: 10 },
              callback: (v: number | string) => formatBytes(Number(v)) + '/s' },
            grid: { color: grid }
          }
        }
      }
    });
  }
}
