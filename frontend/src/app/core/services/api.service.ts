import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SystemOverview } from '../models/system.model';
import { Container, ContainerDetail, DockerInfo } from '../models/docker.model';
import { Service, ServiceHealth, ServiceActionResult, Alert, BlockDevice } from '../models/service.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  getSystemOverview(): Observable<SystemOverview> {
    return this.http.get<SystemOverview>(`${this.base}/system/overview`);
  }

  getContainers(): Observable<Container[]> {
    return this.http.get<Container[]>(`${this.base}/docker/containers`);
  }

  getContainerDetail(name: string): Observable<ContainerDetail> {
    return this.http.get<ContainerDetail>(`${this.base}/docker/containers/${name}`);
  }

  getDockerInfo(): Observable<DockerInfo> {
    return this.http.get<DockerInfo>(`${this.base}/docker/info`);
  }

  getServices(): Observable<Service[]> {
    return this.http.get<Service[]>(`${this.base}/services`);
  }

  getServicesHealth(): Observable<ServiceHealth[]> {
    return this.http.get<ServiceHealth[]>(`${this.base}/services/health`);
  }

  getServiceHealth(name: string): Observable<ServiceHealth> {
    return this.http.get<ServiceHealth>(`${this.base}/services/${encodeURIComponent(name)}/health`);
  }

  serviceAction(name: string, action: 'start' | 'stop' | 'restart'): Observable<ServiceActionResult> {
    return this.http.post<ServiceActionResult>(
      `${this.base}/services/${encodeURIComponent(name)}/compose`,
      { action }
    );
  }

  getStorage(): Observable<{ disks: any[]; filesystems: any[] }> {
    return this.http.get<{ disks: any[]; filesystems: any[] }>(`${this.base}/storage`);
  }

  getDevices(): Observable<BlockDevice[]> {
    return this.http.get<BlockDevice[]>(`${this.base}/storage/devices`);
  }

  remountDevice(device: string): Observable<{ success: boolean; message?: string; error?: string; hint?: string }> {
    return this.http.post<{ success: boolean; message?: string; error?: string; hint?: string }>(
      `${this.base}/storage/remount`, { device }
    );
  }

  getAlerts(): Observable<Alert[]> {
    return this.http.get<Alert[]>(`${this.base}/alerts`);
  }

  getDockerLogs(containerName: string, tail = 100): Observable<{ container: string; lines: string[]; total: number }> {
    return this.http.get<{ container: string; lines: string[]; total: number }>(`${this.base}/logs/docker/${containerName}?tail=${tail}`);
  }
}
