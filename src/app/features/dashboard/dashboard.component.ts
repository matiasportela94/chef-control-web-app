import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DecimalPipe, DatePipe } from '@angular/common';
import { Api } from '../../api/api';
import { getSummary } from '../../api/fn/dashboard-controller/get-summary';
import { DashboardResponse } from '../../api/models/dashboard-response';
import { ProductStock } from '../../api/models/product-stock';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DecimalPipe, DatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  loading = signal(true);
  error   = signal<string | null>(null);
  data    = signal<DashboardResponse | null>(null);

  readonly today = new Date();

  constructor(
    private api: Api,
    public  authService: AuthService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.invoke(getSummary) as unknown;
      const data = raw instanceof Blob
        ? JSON.parse(await raw.text()) as DashboardResponse
        : raw as DashboardResponse;
      this.data.set(data);
    } catch {
      this.error.set('No se pudieron cargar los datos del panel.');
    } finally {
      this.loading.set(false);
    }
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  get kpis()     { return this.data()?.kpis; }
  get products() { return this.data()?.products ?? []; }

  statusLabel(s?: ProductStock['status']): string {
    const map: Record<string, string> = {
      OK:           'OK',
      LOW_STOCK:    'Bajo stock',
      OVERSTOCK:    'Sobrestock',
      NO_THRESHOLD: 'Sin umbral'
    };
    return s ? (map[s] ?? '-') : '-';
  }

  statusClass(s?: ProductStock['status']): string {
    const map: Record<string, string> = {
      OK:           'badge-success',
      LOW_STOCK:    'badge-warning',
      OVERSTOCK:    'badge-brand',
      NO_THRESHOLD: 'badge-neutral'
    };
    return s ? (map[s] ?? 'badge-neutral') : 'badge-neutral';
  }

  formatARS(n?: number): string {
    if (n == null) return '-';
    return '$' + n.toLocaleString('es-AR');
  }
}
