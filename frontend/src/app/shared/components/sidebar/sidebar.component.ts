import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside class="sidebar">
      <div class="sidebar__logo">
        <i class="bi bi-cpu-fill"></i>
        <span>PiControl</span>
      </div>

      <nav class="sidebar__nav">
        @for (item of navItems; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active" class="sidebar__item">
            <i [class]="'bi bi-' + item.icon"></i>
            <span>{{ item.label }}</span>
          </a>
        }
      </nav>

      <div class="sidebar__footer">
        <span class="sidebar__version">PiControl v1.0</span>
      </div>
    </aside>
  `,
  styles: [`
    .sidebar {
      position: fixed;
      left: 0; top: 0;
      height: 100vh;
      width: var(--sidebar-width);
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      z-index: 100;
    }

    .sidebar__logo {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px;
      font-size: 17px;
      font-weight: 700;
      color: var(--accent-blue);
      border-bottom: 1px solid var(--border-color);

      i { font-size: 20px; }
    }

    .sidebar__nav {
      flex: 1;
      padding: 10px 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .sidebar__item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: 8px;
      color: var(--text-secondary);
      font-size: 14px;
      font-weight: 500;
      transition: all .15s;

      i { font-size: 15px; width: 18px; text-align: center; }

      &:hover { background: var(--bg-hover); color: var(--text-primary); }

      &.active {
        background: rgba(59,130,246,.15);
        color: var(--accent-blue);
        border-left: 3px solid var(--accent-blue);
        padding-left: 9px;
      }
    }

    .sidebar__footer {
      padding: 14px 20px;
      border-top: 1px solid var(--border-color);
    }

    .sidebar__version {
      font-size: 11px;
      color: var(--text-muted);
    }
  `]
})
export class SidebarComponent {
  navItems = [
    { path: '/dashboard', label: 'Dashboard',  icon: 'grid-1x2-fill' },
    { path: '/docker',    label: 'Docker',     icon: 'box-seam-fill' },
    { path: '/services',  label: 'Servizi',    icon: 'layers-fill' },
    { path: '/storage',   label: 'Storage',    icon: 'hdd-fill' },
    { path: '/logs',      label: 'Log',        icon: 'terminal-fill' },
  ];
}
