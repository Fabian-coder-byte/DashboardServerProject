import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { BackupEntry } from '../../core/models/service.model';
import { formatBytes } from '../../core/utils/format.utils';

@Component({
  selector: 'app-backup',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
    <div class="page-header">
      <h1><i class="bi bi-cloud-check-fill"></i> Backup</h1>
      <p>Stato dei backup configurati in <code>data/backup-status.json</code></p>
    </div>

    @if (loading) { <div class="loading">Caricamento backup...</div> }
    @if (error)   { <div class="error-msg"><i class="bi bi-exclamation-triangle-fill"></i> {{ error }}</div> }

    @if (!loading && !error) {

      <!-- Riepilogo rapido -->
      <div class="grid grid-3">
        <div class="card">
          <div class="card__title"><i class="bi bi-check-circle"></i> Riusciti</div>
          <div class="card__value text-green">{{ countByStatus('success') }}</div>
        </div>
        <div class="card">
          <div class="card__title"><i class="bi bi-x-circle"></i> Falliti</div>
          <div class="card__value text-red">{{ countByStatus('failed') }}</div>
        </div>
        <div class="card">
          <div class="card__title"><i class="bi bi-dash-circle"></i> Mai eseguiti</div>
          <div class="card__value text-yellow">{{ countByStatus('never') }}</div>
        </div>
      </div>

      <!-- Lista backup -->
      @if (backups.length === 0) {
        <div class="empty-msg" style="padding:48px">
          <i class="bi bi-cloud-slash" style="font-size:32px;display:block;margin-bottom:12px;color:var(--text-muted)"></i>
          Nessun backup configurato. Aggiungi le voci in <code>data/backup-status.json</code>.
        </div>
      } @else {
        <div class="grid grid-2">
          @for (b of backups; track b.name) {
            <div class="card" [class.border-alert]="b.status === 'failed'">

              <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div style="font-size:15px;font-weight:600">{{ b.name }}</div>
                <span [class]="'badge badge-' + statusBadge(b.status)">{{ statusLabel(b.status) }}</span>
              </div>

              <div class="backup-meta">
                <div class="meta-row">
                  <span class="meta-label">Destinazione</span>
                  <span class="font-mono" style="font-size:11px;word-break:break-all">{{ b.destination }}</span>
                </div>
                <div class="meta-row">
                  <span class="meta-label">Ultimo backup</span>
                  @if (b.lastRun) {
                    <span>{{ formatDate(b.lastRun) }}</span>
                  } @else {
                    <span class="text-muted">Mai eseguito</span>
                  }
                </div>
                @if (b.nextRun) {
                  <div class="meta-row">
                    <span class="meta-label">Prossimo backup</span>
                    <span>{{ formatDate(b.nextRun) }}</span>
                  </div>
                }
                @if (b.sizeBytes) {
                  <div class="meta-row">
                    <span class="meta-label">Dimensione</span>
                    <span>{{ formatBytes(b.sizeBytes) }}</span>
                  </div>
                }
              </div>

            </div>
          }
        </div>
      }

      <!-- Info aggiornamento -->
      <div class="info-note">
        <i class="bi bi-info-circle-fill"></i>
        <div>
          <strong>Come aggiornare automaticamente lo stato:</strong> aggiungi un comando alla fine dello script di backup
          che scriva il risultato in <code>data/backup-status.json</code>. Il file viene riletto ad ogni richiesta senza riavviare il container.
        </div>
      </div>

    }
    </div><!-- /page -->
  `,
  styles: [`
    .border-alert { border-color: var(--accent-red) !important; }

    .backup-meta {
      margin-top: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .meta-row {
      display: flex;
      gap: 10px;
      align-items: baseline;
      font-size: 13px;
    }

    .meta-label {
      color: var(--text-muted);
      min-width: 130px;
      font-size: 12px;
      flex-shrink: 0;
    }

    .info-note {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 14px 16px;
      background: rgba(59,130,246,.08);
      border: 1px solid rgba(59,130,246,.2);
      border-radius: 10px;
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.6;

      i { color: var(--accent-blue); margin-top: 2px; flex-shrink: 0; }
      code { background: var(--bg-hover); padding: 1px 6px; border-radius: 4px; font-size: 12px; }
    }
  `]
})
export class BackupComponent implements OnInit {
  private api = inject(ApiService);

  backups: BackupEntry[] = [];
  loading = true;
  error?: string;

  formatBytes = formatBytes;

  formatDate(iso: string) {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  statusBadge(status: string): string {
    if (status === 'success') return 'green';
    if (status === 'failed')  return 'red';
    if (status === 'running') return 'blue';
    return 'yellow';
  }

  statusLabel(status: string): string {
    if (status === 'success') return 'OK';
    if (status === 'failed')  return 'Fallito';
    if (status === 'running') return 'In corso';
    return 'Mai eseguito';
  }

  countByStatus(status: string): number {
    return this.backups.filter(b => b.status === status).length;
  }

  ngOnInit() {
    this.api.getBackupStatus().subscribe({
      next: data => {
        this.backups = data.backups;
        this.loading = false;
      },
      error: () => {
        this.error   = 'Errore nel caricamento dello stato dei backup.';
        this.loading = false;
      }
    });
  }
}
