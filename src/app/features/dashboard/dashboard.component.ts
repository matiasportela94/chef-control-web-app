import { Component, OnInit, signal } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api } from '../../api/api';
import { getSummary } from '../../api/fn/dashboard-controller/get-summary';
import { list4 } from '../../api/fn/alert-controller/list-4';
import { DashboardResponse } from '../../api/models/dashboard-response';
import { ProductStock } from '../../api/models/product-stock';
import { AlertResponse } from '../../api/models/alert-response';
import { PagedResponseAlertResponse } from '../../api/models/paged-response-alert-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatARS } from '../../core/utils/format';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DecimalPipe, DatePipe, RouterLink, SpinnerComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  loading = signal(true);
  error   = signal<string | null>(null);
  data    = signal<DashboardResponse | null>(null);
  alerts  = signal<AlertResponse[]>([]);

  readonly today = new Date();

  constructor(private api: Api) {}

  async ngOnInit(): Promise<void> {
    await Promise.all([this.load(), this.loadAlerts()]);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.invoke(getSummary) as unknown;
      this.data.set(await parseBlob<DashboardResponse>(raw));
    } catch {
      this.error.set('No se pudieron cargar los datos del panel.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadAlerts(): Promise<void> {
    try {
      const raw = await this.api.invoke(list4, { page: 0, size: 5 }) as unknown;
      const res = await parseBlob<PagedResponseAlertResponse>(raw);
      this.alerts.set((res.content ?? []).filter(a => !a.resolvedAt));
    } catch { /* non-critical */ }
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

  alertSeverityClass(s?: string): string {
    if (!s) return 'alert-low';
    const u = s.toUpperCase();
    if (u === 'CRITICAL' || u === 'HIGH') return 'alert-high';
    if (u === 'MEDIUM')                   return 'alert-medium';
    return 'alert-low';
  }

  alertTypeLabel(t?: string): string {
    const map: Record<string, string> = {
      LOW_STOCK:   'Bajo stock',
      OVERSTOCK:   'Sobrestock',
      EXPIRY:      'Vencimiento',
      WASTE_SPIKE: 'Pico de merma',
    };
    return t ? (map[t] ?? t.replace(/_/g, ' ')) : '—';
  }

  readonly formatARS = formatARS;
}
