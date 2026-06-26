import { Component, EventEmitter, Output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule],
  template: `
    <aside class="sidebar" [class.open]="open">
      <div class="sidebar__logo">
        <i class="bi bi-cpu-fill"></i>
        <span class="sidebar__text">PiControl</span>
      </div>

      <nav class="sidebar__nav">
        @for (item of navItems; track item.path) {
          <a [routerLink]="item.path"
             routerLinkActive="active"
             class="sidebar__item"
             [title]="item.label"
             (click)="close()">
            <i [class]="'bi bi-' + item.icon"></i>
            <span class="sidebar__text">{{ item.label }}</span>
          </a>
        }
      </nav>

      <div class="sidebar__footer sidebar__text">
        PiControl v1.0
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
      overflow: hidden;
      transition: width .2s ease, transform .2s ease;
    }

    .sidebar__logo {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 20px 16px;
      font-size: 17px;
      font-weight: 700;
      color: var(--accent-blue);
      border-bottom: 1px solid var(--border-color);
      white-space: nowrap;
      i { font-size: 20px; flex-shrink: 0; }
    }

    .sidebar__nav {
      flex: 1;
      padding: 12px 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .sidebar__item {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 9px;
      color: var(--text-secondary);
      font-size: 14px;
      font-weight: 500;
      transition: all .15s;
      white-space: nowrap;

      i { font-size: 16px; width: 20px; text-align: center; flex-shrink: 0; }

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
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
    }

    /* Desktop: full width — show text */
    @media (min-width: 1025px) {
      .sidebar__item { justify-content: flex-start; }
      .sidebar__logo { justify-content: flex-start; }
    }

    /* Tablet (641–1024): icon-only */
    @media (max-width: 1024px) and (min-width: 641px) {
      .sidebar__text { display: none; }
      .sidebar__item { justify-content: center; padding: 10px; }
      .sidebar__logo { justify-content: center; padding: 18px 8px; }
      .sidebar__footer { padding: 12px 8px; display: none; }
      .sidebar__item.active { border-left: none; padding-left: 10px; border-bottom: 2px solid var(--accent-blue); }
    }

    /* Mobile: nascosta di default, visibile quando .open */
    @media (max-width: 640px) {
      .sidebar {
        width: 240px;
        transform: translateX(-100%);
        box-shadow: none;
      }
      .sidebar.open {
        transform: translateX(0);
        box-shadow: 4px 0 24px rgba(0,0,0,.5);
      }
      .sidebar__item { justify-content: flex-start; }
      .sidebar__logo { justify-content: flex-start; }
    }
  `]
})
export class SidebarComponent {
  @Output() toggleOverlay = new EventEmitter<boolean>();

  open = false;

  navItems = [
    { path: '/dashboard', label: 'Dashboard',  icon: 'grid-1x2-fill' },
    { path: '/system',    label: 'Sistema',    icon: 'cpu-fill' },
    { path: '/docker',    label: 'Docker',     icon: 'box-seam-fill' },
    { path: '/services',  label: 'Servizi',    icon: 'layers-fill' },
    { path: '/storage',   label: 'Storage',    icon: 'hdd-fill' },
    { path: '/logs',      label: 'Log',        icon: 'terminal-fill' },
  ];

  toggle(): void {
    this.open = !this.open;
    this.toggleOverlay.emit(this.open);
  }

  close(): void {
    this.open = false;
    this.toggleOverlay.emit(false);
  }
}
