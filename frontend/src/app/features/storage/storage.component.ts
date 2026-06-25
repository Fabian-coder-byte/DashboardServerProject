import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { BlockDevice } from '../../core/models/service.model';
import { formatBytes, progressClass } from '../../core/utils/format.utils';

interface RemountState {
  loading: boolean;
  success?: boolean;
  message?: string;
  error?: string;
  hint?: string;
}

@Component({
  selector: 'app-storage',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-header">
      <h1><i class="bi bi-hdd-fill"></i> Storage</h1>
      <p>Filesystem montati e dispositivi collegati</p>
    </div>

    <!-- ── Filesystem montati ── -->
    @if (fsLoading) { <div class="loading">Caricamento filesystem...</div> }
    @if (fsError)   { <div class="error-msg"><i class="bi bi-exclamation-triangle-fill"></i> {{ fsError }}</div> }

    @if (!fsLoading && filesystems.length > 0) {
      <div class="section-title mb-16">
        <i class="bi bi-pie-chart-fill"></i> Filesystem montati
      </div>

      <div class="grid grid-2 mb-20">
        @for (fs of filesystems; track fs.mount) {
          <div class="card" [class.card--warn]="fs.warning">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px">
              <div>
                <div style="font-weight: 600; font-size: 15px">{{ fs.mount }}</div>
                <div style="font-size: 12px; color: var(--text-muted)">{{ fs.type }} · {{ fs.filesystem }}</div>
              </div>
              @if (fs.warning) {
                <span class="badge badge-yellow"><i class="bi bi-exclamation-triangle"></i> Quasi pieno</span>
              }
            </div>

            <div class="progress-bar" style="height: 8px; margin-bottom: 8px">
              <div class="progress-bar__fill"
                [class]="progressClass(fs.usedPercent)"
                [style.width.%]="fs.usedPercent">
              </div>
            </div>

            <div style="display: flex; justify-content: space-between; font-size: 13px">
              <span>Usato: <strong>{{ formatBytes(fs.used) }}</strong> ({{ fs.usedPercent }}%)</span>
              <span class="text-muted">Libero: {{ formatBytes(fs.free) }} / {{ formatBytes(fs.total) }}</span>
            </div>
          </div>
        }
      </div>
    }

    <!-- ── Dispositivi block ── -->
    <div style="display: flex; justify-content: space-between; align-items: center" class="mb-16">
      <div class="section-title">
        <i class="bi bi-device-hdd"></i> Dispositivi collegati
      </div>
      <button class="btn btn-secondary btn-sm" (click)="loadDevices()" [disabled]="devLoading">
        <i class="bi bi-arrow-clockwise"></i> Aggiorna
      </button>
    </div>

    @if (devLoading) { <div class="loading">Scansione dispositivi...</div> }
    @if (devError) {
      <div class="error-msg mb-16">
        <i class="bi bi-exclamation-triangle-fill"></i> {{ devError }}
      </div>
    }

    @if (!devLoading && !devError && devices.length > 0) {
      <div class="card">
        <table class="table">
          <thead>
            <tr>
              <th>Dispositivo</th>
              <th>Modello</th>
              <th>Tipo FS</th>
              <th>Dimensione</th>
              <th>Mount point</th>
              <th>Stato</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            @for (d of devices; track d.path) {
              <tr [class.row-disk]="d.type === 'disk'" [class.row-part]="d.type === 'part'">

                <!-- Nome dispositivo -->
                <td>
                  <div style="display: flex; align-items: center; gap: 8px">
                    @if (d.type === 'disk') {
                      <i class="bi bi-hdd" style="color: var(--accent-blue)"></i>
                    } @else if (d.type === 'part') {
                      <i class="bi bi-hdd-stack" style="color: var(--text-muted); margin-left: 14px; font-size: 12px"></i>
                    } @else {
                      <i class="bi bi-disc" style="color: var(--text-muted)"></i>
                    }
                    <span class="font-mono" [style.fontWeight]="d.type === 'disk' ? '600' : '400'">
                      {{ d.path }}
                    </span>
                    @if (d.label) {
                      <span class="badge badge-blue" style="font-size: 10px">{{ d.label }}</span>
                    }
                  </div>
                </td>

                <!-- Modello -->
                <td class="text-muted" style="font-size: 12px">
                  {{ d.vendor ? d.vendor + ' ' : '' }}{{ d.model || (d.type === 'disk' ? '—' : '') }}
                </td>

                <!-- Tipo filesystem -->
                <td>
                  @if (d.fstype) {
                    <span class="badge badge-gray">{{ d.fstype }}</span>
                  } @else {
                    <span class="text-muted">—</span>
                  }
                </td>

                <!-- Dimensione -->
                <td>{{ d.size > 0 ? formatBytes(d.size) : '—' }}</td>

                <!-- Mount point -->
                <td class="font-mono" style="font-size: 12px">
                  {{ d.mountpoint || '—' }}
                </td>

                <!-- Stato -->
                <td>
                  @if (d.type === 'disk') {
                    <span class="badge badge-blue">disco</span>
                  } @else if (d.mounted) {
                    <span class="badge badge-green"><i class="bi bi-check-circle-fill"></i> Montato</span>
                  } @else if (d.fstype) {
                    <span class="badge badge-yellow"><i class="bi bi-exclamation-triangle-fill"></i> Non montato</span>
                  } @else {
                    <span class="badge badge-gray">Nessun FS</span>
                  }
                </td>

                <!-- Azioni -->
                <td>
                  @if (d.type === 'part' && !d.mounted && d.fstype) {
                    <div style="display: flex; gap: 6px; align-items: center">
                      <!-- Copia comando mount -->
                      <button class="btn btn-secondary btn-sm" (click)="copyMountCmd(d)" title="Copia comando">
                        <i class="bi bi-clipboard"></i> Copia
                      </button>
                      <!-- Rimonta via API -->
                      <button
                        class="btn btn-primary btn-sm"
                        (click)="remount(d)"
                        [disabled]="remountStates[d.path]?.loading"
                        title="Rimonta (richiede voce in /etc/fstab)">
                        @if (remountStates[d.path]?.loading) {
                          <i class="bi bi-arrow-clockwise spin"></i>
                        } @else {
                          <i class="bi bi-lightning-fill"></i>
                        }
                        Rimonta
                      </button>
                    </div>

                    <!-- Feedback rimonta -->
                    @if (remountStates[d.path]?.success === true) {
                      <div class="feedback feedback--ok">
                        <i class="bi bi-check-circle-fill"></i> {{ remountStates[d.path].message }}
                      </div>
                    }
                    @if (remountStates[d.path]?.success === false) {
                      <div class="feedback feedback--err">
                        <i class="bi bi-x-circle-fill"></i> {{ remountStates[d.path].error }}
                        @if (remountStates[d.path].hint) {
                          <div style="font-size: 11px; margin-top: 2px; opacity: .8">{{ remountStates[d.path].hint }}</div>
                        }
                      </div>
                    }
                  }
                </td>

              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Nota fstab -->
      <div class="note mt-16">
        <i class="bi bi-info-circle"></i>
        <div>
          <strong>Rimonta automatico</strong> funziona solo se il dispositivo ha una voce in <code>/etc/fstab</code> sul Raspberry.
          Usa <strong>Copia</strong> per ottenere il comando da eseguire manualmente nel terminale.
          Comando manuale: <code>sudo mount /dev/sdXn /tuo/mountpoint</code>
        </div>
      </div>
    }

    @if (!devLoading && !devError && devices.length === 0) {
      <div class="empty-msg">Nessun dispositivo rilevato</div>
    }

    <!-- Toast copia -->
    @if (copied) {
      <div class="toast"><i class="bi bi-clipboard-check"></i> Comando copiato!</div>
    }
  `,
  styles: [`
    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .card--warn { border-color: var(--accent-yellow) !important; }

    .row-disk td { background: rgba(59,130,246,.04); }
    .row-part td { padding-top: 8px; padding-bottom: 8px; }

    .feedback {
      margin-top: 6px;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .feedback--ok  { background: rgba(34,197,94,.1);  color: var(--accent-green); }
    .feedback--err { background: rgba(239,68,68,.1);  color: var(--accent-red); }

    .note {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px 16px;
      background: rgba(59,130,246,.08);
      border: 1px solid rgba(59,130,246,.2);
      border-radius: 8px;
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.6;

      i { color: var(--accent-blue); margin-top: 2px; flex-shrink: 0; }
      code { background: var(--bg-hover); padding: 1px 5px; border-radius: 3px; }
    }

    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--accent-green);
      color: #fff;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,.3);
      animation: slideIn .2s ease;
    }

    @keyframes slideIn { from { transform: translateY(10px); opacity: 0; } }

    .spin { animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class StorageComponent implements OnInit {
  private api = inject(ApiService);

  filesystems: any[] = [];
  devices: BlockDevice[] = [];

  fsLoading = true;
  fsError?: string;
  devLoading = false;
  devError?: string;

  remountStates: Record<string, RemountState> = {};
  copied = false;

  formatBytes = formatBytes;
  progressClass = progressClass;

  ngOnInit() {
    this.api.getStorage().subscribe({
      next: data => {
        this.filesystems = data.filesystems;
        this.fsLoading = false;
      },
      error: () => {
        this.fsError = 'Errore nel caricamento dei filesystem.';
        this.fsLoading = false;
      }
    });

    this.loadDevices();
  }

  loadDevices() {
    this.devLoading = true;
    this.devError = undefined;

    this.api.getDevices().subscribe({
      next: data => {
        this.devices = data;
        this.devLoading = false;
      },
      error: (err) => {
        this.devError = err.error?.error ?? 'Errore nel rilevamento dispositivi. Assicurati che il container giri con privileged: true.';
        this.devLoading = false;
      }
    });
  }

  copyMountCmd(device: BlockDevice) {
    const mp = device.mountpoint || `/mnt/${device.name}`;
    const cmd = `sudo mount ${device.path} ${mp}`;
    navigator.clipboard.writeText(cmd);
    this.copied = true;
    setTimeout(() => this.copied = false, 2500);
  }

  remount(device: BlockDevice) {
    this.remountStates[device.path] = { loading: true };

    this.api.remountDevice(device.path).subscribe({
      next: res => {
        this.remountStates[device.path] = { loading: false, success: true, message: res.message };
        // Aggiorna la lista dopo il rimonta
        setTimeout(() => this.loadDevices(), 1500);
      },
      error: (err) => {
        const body = err.error ?? {};
        this.remountStates[device.path] = {
          loading: false,
          success: false,
          error: body.error ?? 'Rimonta fallito',
          hint: body.hint
        };
      }
    });
  }
}
