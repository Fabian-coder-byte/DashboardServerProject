import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { interval, Subscription, forkJoin } from 'rxjs';
import { startWith, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { SystemOverview, NetworkInfo } from '../../core/models/system.model';
import { formatBytes } from '../../core/utils/format.utils';

@Component({
  selector: 'app-network',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
    <div class="page-header">
      <h1><i class="bi bi-wifi"></i> Rete</h1>
      <p>Interfacce di rete, Tailscale e traffico</p>
    </div>

    @if (loading) { <div class="loading">Caricamento informazioni di rete...</div> }
    @if (error)   { <div class="error-msg"><i class="bi bi-exclamation-triangle-fill"></i> {{ error }}</div> }

    @if (!loading && network) {
      <!-- Riepilogo cards -->
      <div class="grid grid-3">

        <!-- Host e IP locale -->
        <div class="card">
          <div class="card__title"><i class="bi bi-pc-display-horizontal"></i> Host</div>
          <div class="card__value" style="font-size:18px">{{ network.hostname ?? 'N/D' }}</div>
          @if (network.localIp) {
            <div class="card__sub" style="margin-top:6px">
              <i class="bi bi-ethernet"></i> {{ network.localIp }}
            </div>
          }
        </div>

        <!-- Tailscale -->
        <div class="card">
          <div class="card__title"><i class="bi bi-shield-lock"></i> Tailscale</div>
          @if (network.tailscale.online) {
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
              <span class="status-dot dot-green"></span>
              <div class="card__value text-green" style="font-size:18px">Online</div>
            </div>
            <div class="card__sub" style="margin-top:6px">{{ network.tailscale.ip }}</div>
            @if (network.tailscale.hostname) {
              <div class="card__sub" style="word-break:break-all">{{ network.tailscale.hostname }}</div>
            }
          } @else {
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
              <span class="status-dot dot-red"></span>
              <div class="card__value text-red" style="font-size:18px">Offline</div>
            </div>
            <div class="card__sub" style="margin-top:6px">Accesso remoto non disponibile</div>
          }
        </div>

        <!-- Traffico live -->
        <div class="card">
          <div class="card__title"><i class="bi bi-activity"></i> Traffico</div>
          @if (system) {
            @for (iface of system.network.slice(0, 3); track iface.interface) {
              <div style="margin-top:8px">
                <div style="font-size:12px;color:var(--text-muted)">{{ iface.interface }}</div>
                <div style="font-size:13px;display:flex;gap:12px;margin-top:2px">
                  <span class="text-green"><i class="bi bi-arrow-down"></i> {{ formatBytes(iface.rxSec) }}/s</span>
                  <span class="text-yellow"><i class="bi bi-arrow-up"></i> {{ formatBytes(iface.txSec) }}/s</span>
                </div>
              </div>
            }
          } @else {
            <div class="card__sub">Caricamento...</div>
          }
        </div>

      </div>

      <!-- Interfacce di rete -->
      @if (network.interfaces.length > 0) {
        <div class="card">
          <div class="card__title"><i class="bi bi-hdd-network"></i> Interfacce host</div>
          <div class="table-responsive">
          <table class="table mt-12">
            <thead>
              <tr><th>Interfaccia</th><th>IPv4</th><th>Stato</th></tr>
            </thead>
            <tbody>
              @for (iface of network.interfaces; track iface.name) {
                <tr>
                  <td class="font-mono" style="font-weight:600">{{ iface.name }}</td>
                  <td class="font-mono text-muted">{{ iface.ip4 ?? '—' }}</td>
                  <td><span class="badge badge-green">Attivo</span></td>
                </tr>
              }
              @if (network.tailscale.online) {
                <tr>
                  <td class="font-mono" style="font-weight:600">ts0</td>
                  <td class="font-mono text-muted">{{ network.tailscale.ip }}</td>
                  <td><span class="badge badge-blue">Tailscale</span></td>
                </tr>
              }
            </tbody>
          </table>
          </div>
        </div>
      } @else {
        <div class="card">
          <div class="card__title"><i class="bi bi-hdd-network"></i> Interfacce host</div>
          <div class="empty-msg">
            Impossibile leggere le interfacce host. Verifica che il container abbia <code>pid: host</code> nel docker-compose.yml.
          </div>
        </div>
      }
    }
    </div><!-- /page -->
  `,
  styles: [`
    .status-dot {
      display: inline-block;
      width: 10px; height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot-green { background: var(--accent-green); box-shadow: 0 0 6px var(--accent-green); }
    .dot-red   { background: var(--accent-red);   box-shadow: 0 0 6px var(--accent-red); }
    .mt-12 { margin-top: 12px; }
    code { background: var(--bg-hover); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  `]
})
export class NetworkComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private poll?: Subscription;

  network?: NetworkInfo;
  system?: SystemOverview;
  loading = true;
  error?: string;

  formatBytes = formatBytes;

  ngOnInit() {
    this.poll = interval(10000).pipe(
      startWith(0),
      switchMap(() => forkJoin({
        network: this.api.getNetworkInfo().pipe(catchError(() => of(null))),
        system:  this.api.getSystemOverview().pipe(catchError(() => of(null)))
      }))
    ).subscribe({
      next: ({ network, system }) => {
        if (network) this.network = network as NetworkInfo;
        if (system)  this.system  = system as SystemOverview;
        this.loading = false;
        if (!network) this.error = 'Impossibile caricare le informazioni di rete.';
      },
      error: () => {
        this.error   = 'Errore nel caricamento delle informazioni di rete.';
        this.loading = false;
      }
    });
  }

  ngOnDestroy() { this.poll?.unsubscribe(); }
}
