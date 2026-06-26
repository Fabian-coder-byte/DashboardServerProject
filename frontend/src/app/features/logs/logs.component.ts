import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ApiService as Api } from '../../core/services/api.service';
import { Container } from '../../core/models/docker.model';

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
    <div class="page-header">
      <h1><i class="bi bi-terminal-fill"></i> Log</h1>
      <p>Visualizza i log dei container Docker</p>
    </div>

    <div class="card">
      <div style="display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap">
        <div>
          <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 4px">Container</label>
          <select [(ngModel)]="selectedContainer" class="select-input">
            <option value="">Seleziona container...</option>
            @for (c of containers; track c.id) {
              <option [value]="c.name">{{ c.name }} ({{ c.status }})</option>
            }
          </select>
        </div>
        <div>
          <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 4px">Righe</label>
          <select [(ngModel)]="tailLines" class="select-input">
            <option [value]="50">50</option>
            <option [value]="100">100</option>
            <option [value]="200">200</option>
            <option [value]="500">500</option>
          </select>
        </div>
        <button class="btn btn-primary" (click)="loadLogs()" [disabled]="!selectedContainer || logsLoading">
          <i class="bi bi-play-fill"></i> Carica log
        </button>
        @if (lines.length > 0) {
          <button class="btn btn-secondary" (click)="copyLogs()">
            <i class="bi bi-clipboard"></i> Copia
          </button>
        }
      </div>
    </div>

    @if (logsLoading) { <div class="loading">Caricamento log...</div> }
    @if (logsError)   { <div class="error-msg"><i class="bi bi-exclamation-triangle-fill"></i> {{ logsError }}</div> }

    @if (lines.length > 0 && !logsLoading) {
      <div class="card">
        <div class="card__title" style="display: flex; justify-content: space-between">
          <span><i class="bi bi-file-text"></i> {{ selectedContainer }} — {{ lines.length }} righe</span>
          <span class="text-muted" style="font-size: 11px">{{ lastUpdated }}</span>
        </div>
        <div class="log-viewer mt-12">
          @for (line of filteredLines; track $index) {
            <div class="log-line" [class.log-error]="isError(line)" [class.log-warn]="isWarn(line)">
              {{ line }}
            </div>
          }
        </div>
      </div>
    }

    @if (!selectedContainer) {
      <div class="empty-msg" style="padding: 60px">
        <i class="bi bi-terminal" style="font-size: 32px; display: block; margin-bottom: 12px; color: var(--text-muted)"></i>
        Seleziona un container per visualizzare i log
      </div>
    }
    </div><!-- /page -->
  `,
  styles: [`
    .select-input {
      background: var(--bg-hover);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 13px;
      min-width: 200px;
    }

    .log-viewer {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px;
      max-height: 60vh;
      overflow-y: auto;
      font-family: 'Courier New', monospace;
      font-size: 12px;
    }

    .log-line {
      padding: 2px 0;
      color: var(--text-secondary);
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .log-error { color: var(--accent-red); }
    .log-warn  { color: var(--accent-yellow); }
  `]
})
export class LogsComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  containers: Container[] = [];
  selectedContainer = '';
  tailLines = 100;
  lines: string[] = [];
  logsLoading = false;
  logsError?: string;
  lastUpdated = '';

  get filteredLines() { return this.lines; }

  isError(line: string) { return /error|exception|fatal|critical/i.test(line); }
  isWarn(line: string)  { return /warn|warning/i.test(line); }

  ngOnInit() {
    this.api.getContainers().subscribe({
      next: data => {
        this.containers = data;
        const qc = this.route.snapshot.queryParamMap.get('container');
        if (qc) { this.selectedContainer = qc; this.loadLogs(); }
      }
    });
  }

  loadLogs() {
    if (!this.selectedContainer) return;
    this.logsLoading = true;
    this.logsError = undefined;

    this.api.getDockerLogs(this.selectedContainer, this.tailLines).subscribe({
      next: data => {
        this.lines = data.lines;
        this.lastUpdated = new Date().toLocaleTimeString('it-IT');
        this.logsLoading = false;
      },
      error: () => {
        this.logsError = `Impossibile caricare i log di "${this.selectedContainer}".`;
        this.logsLoading = false;
      }
    });
  }

  copyLogs() {
    navigator.clipboard.writeText(this.lines.join('\n'));
  }
}
