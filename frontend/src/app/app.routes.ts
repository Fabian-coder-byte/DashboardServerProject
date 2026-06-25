import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'docker',
    loadComponent: () => import('./features/docker/docker.component').then(m => m.DockerComponent)
  },
  {
    path: 'docker/:name',
    loadComponent: () => import('./features/docker/docker-detail.component').then(m => m.DockerDetailComponent)
  },
  {
    path: 'services',
    loadComponent: () => import('./features/services/services.component').then(m => m.ServicesComponent)
  },
  {
    path: 'storage',
    loadComponent: () => import('./features/storage/storage.component').then(m => m.StorageComponent)
  },
  {
    path: 'logs',
    loadComponent: () => import('./features/logs/logs.component').then(m => m.LogsComponent)
  },
  { path: '**', redirectTo: '/dashboard' }
];
