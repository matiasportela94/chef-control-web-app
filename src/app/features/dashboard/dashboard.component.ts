import { Component, OnInit, DestroyRef, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe, DatePipe, PercentPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api } from '../../api/api';
import { AiRefreshService } from '../../core/services/ai-refresh.service';
import { getSummary } from '../../api/fn/dashboard-controller/get-summary';
import { list4 } from '../../api/fn/alert-controller/list-4';
import { DashboardResponse } from '../../api/models/dashboard-response';
import { AlertResponse } from '../../api/models/alert-response';
import { PagedResponseAlertResponse } from '../../api/models/paged-response-alert-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatARS } from '../../core/utils/format';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DecimalPipe, DatePipe, PercentPipe, RouterLink, SpinnerComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  loading = signal(true);
  error   = signal<string | null>(null);
  data    = signal<DashboardResponse | null>(null);
  alerts  = signal<AlertResponse[]>([]);

  readonly today = new Date();

  foodCostPct = computed(() => {
    const k = this.data()?.kpis;
    if (!k) return null;
    const cost  = Number(k.salesCostThisMonth  ?? 0);
    const sales = Number(k.salesTotalThisMonth ?? 0);
    return sales > 0 ? (cost / sales) : null;
  });

  constructor(private api: Api, private aiRefresh: AiRefreshService) {}

  async ngOnInit(): Promise<void> {
    this.aiRefresh.executed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void Promise.all([this.load(), this.loadAlerts()]));
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

  get kpis() { return this.data()?.kpis; }

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
