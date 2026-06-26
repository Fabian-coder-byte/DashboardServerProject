import { Component, ViewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent],
  template: `
    <!-- Overlay mobile (chiude sidebar al click fuori) -->
    <div class="sidebar-overlay"
         [class.visible]="overlayVisible"
         (click)="sidebar.close()">
    </div>

    <!-- Header bar solo su mobile -->
    <div class="mobile-bar">
      <i class="bi bi-cpu-fill" style="color:var(--accent-blue);font-size:18px"></i>
      <span class="mobile-bar__title">PiControl</span>
      <button class="mobile-bar__toggle" (click)="sidebar.toggle()" aria-label="Menu">
        <i class="bi bi-list"></i>
      </button>
    </div>

    <div class="layout">
      <app-sidebar #sidebar (toggleOverlay)="overlayVisible = $event" />
      <main class="layout__content">
        <router-outlet />
      </main>
    </div>
  `
})
export class AppComponent {
  @ViewChild('sidebar') sidebar!: SidebarComponent;
  overlayVisible = false;
}
