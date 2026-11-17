import { Component, OnInit, DestroyRef, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api } from '../../api/api';
import { AiRefreshService } from '../../core/services/ai-refresh.service';
import { getSummary } from '../../api/fn/dashboard-controller/get-summary';
import { listAlerts } from '../../api/fn/alert-controller/list-alerts';
import { DashboardResponse } from '../../api/models/dashboard-response';
import { AlertResponse } from '../../api/models/alert-response';
import { PagedResponseAlertResponse } from '../../api/models/paged-response-alert-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatARS, formatPct } from '../../core/utils/format';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe, DecimalPipe, PercentPipe, RouterLink, SpinnerComponent],
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

  /**
   * Food cost del mes, del back y EN PORCENTAJE (30.00, no 0,30); null sin ventas. No se calcula acá: en un RI va
   * sobre la venta sin IVA, y salesTotal* es lo cobrado (con IVA).
   */
  foodCostPct = computed(() => this.data()?.kpis?.foodCostPercentageThisMonth ?? null);

  salesPct = computed(() => this.pctChange(
    this.data()?.kpis?.salesTotalThisMonth,
    this.data()?.kpis?.salesTotalLastMonth
  ));

  purchasesPct = computed(() => this.pctChange(
    this.data()?.kpis?.purchasesTotalThisMonth,
    this.data()?.kpis?.purchasesTotalLastMonth
  ));

  wastePct = computed(() => this.pctChange(
    this.data()?.kpis?.wasteTotalArsThisMonth,
    this.data()?.kpis?.wasteTotalArsLastMonth
  ));

  /** Diferencia en puntos porcentuales contra el mes anterior (31 % vs 28 % = +3 pts). Antes era una variación relativa. */
  foodCostPctDelta = computed(() => {
    const k = this.data()?.kpis;
    const cur = k?.foodCostPercentageThisMonth, prev = k?.foodCostPercentageLastMonth;
    return cur == null || prev == null ? null : cur - prev;
  });

  private pctChange(current?: number, previous?: number): number | null {
    const c = Number(current  ?? 0);
    const p = Number(previous ?? 0);
    if (p === 0) return null;
    return (c - p) / Math.abs(p);
  }

  constructor(private api: Api, private aiRefresh: AiRefreshService, private i18n: I18nService) {}

  t(key: string): string {
    return this.i18n.t(key);
  }

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
      const raw = await this.api.invoke(listAlerts, { page: 0, size: 5 }) as unknown;
      const res = await parseBlob<PagedResponseAlertResponse>(raw);
      this.alerts.set((res.content ?? []).filter(a => !a.resolvedAt));
    } catch { /* non-critical */ }
  }

  get kpis() { return this.data()?.kpis; }

  alertSeverityClass(s?: string): string {
    if (!s) return 'alert-low';
    const u = s.toUpperCase();
    if (u === 'CRITICAL') return 'alert-high';
    if (u === 'WARNING')  return 'alert-medium';
    return 'alert-low';
  }

  alertTypeLabel(t?: string): string {
    const map: Record<string, string> = {
      LOW_STOCK:      'Bajo stock',
      OVERSTOCK:      'Sobrestock',
      EXPIRATION:     'Vencimiento',
      PRICE_INCREASE: 'Aumento de precio',
      WASTE_ABOVE_STANDARD: 'Merma alta',
    };
    return t ? (map[t] ?? t.replace(/_/g, ' ')) : '—';
  }

  readonly formatARS = formatARS;
  readonly formatPct = formatPct;
}
