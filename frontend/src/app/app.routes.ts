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
    path: 'services/:name',
    loadComponent: () => import('./features/services/service-detail.component').then(m => m.ServiceDetailComponent)
  },
  {
    path: 'storage',
    loadComponent: () => import('./features/storage/storage.component').then(m => m.StorageComponent)
  },
  {
    path: 'logs',
    loadComponent: () => import('./features/logs/logs.component').then(m => m.LogsComponent)
  },
  {
    path: 'system',
    loadComponent: () => import('./features/system/system.component').then(m => m.SystemComponent)
  },
  {
    path: 'network',
    loadComponent: () => import('./features/network/network.component').then(m => m.NetworkComponent)
  },
  {
    path: 'backup',
    loadComponent: () => import('./features/backup/backup.component').then(m => m.BackupComponent)
  },
  { path: '**', redirectTo: '/dashboard' }
];
