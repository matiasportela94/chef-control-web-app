import { Component, OnInit, signal } from '@angular/core';
import { Api } from '../../api/api';
import { list4 } from '../../api/fn/alert-controller/list-4';
import { markRead } from '../../api/fn/alert-controller/mark-read';
import { resolve } from '../../api/fn/alert-controller/resolve';
import { AlertResponse } from '../../api/models/alert-response';
import { PagedResponseAlertResponse } from '../../api/models/paged-response-alert-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatDate } from '../../core/utils/format';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { AlertNotificationService } from '../../core/services/alert-notification.service';

type FilterMode = 'active' | 'all';

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [PaginatorComponent],
  templateUrl: './alerts.component.html',
  styleUrl: './alerts.component.scss'
})
export class AlertsComponent implements OnInit {
  alerts   = signal<AlertResponse[]>([]);
  loading  = signal(true);
  error    = signal<string | null>(null);
  page     = signal(1);
  pageSize = 20;
  total    = signal(0);
  filter   = signal<FilterMode>('active');

  actioning = signal<string | null>(null);

  constructor(private api: Api, private alertNotification: AlertNotificationService) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.invoke(list4, { page: this.page() - 1, size: this.pageSize }) as unknown;
      const res = await parseBlob<PagedResponseAlertResponse>(raw);
      const all = res.content ?? [];
      this.total.set(res.totalElements ?? 0);
      this.alerts.set(this.filter() === 'active' ? all.filter(a => !a.resolvedAt) : all);
    } catch {
      this.error.set('No se pudieron cargar las alertas.');
    } finally {
      this.loading.set(false);
    }
  }

  async setFilter(f: FilterMode): Promise<void> {
    this.filter.set(f);
    this.page.set(1);
    await this.load();
  }

  async goToPage(p: number): Promise<void> {
    this.page.set(p);
    await this.load();
  }

  async doMarkRead(a: AlertResponse): Promise<void> {
    if (!a.id || a.isRead || this.actioning()) return;
    this.actioning.set(a.id);
    try {
      await this.api.invoke(markRead, { id: a.id });
      await this.load();
      await this.alertNotification.refresh();
    } catch { /* stay */ }
    finally { this.actioning.set(null); }
  }

  async doResolve(a: AlertResponse): Promise<void> {
    if (!a.id || a.resolvedAt || this.actioning()) return;
    this.actioning.set(a.id);
    try {
      await this.api.invoke(resolve, { id: a.id });
      await this.load();
      await this.alertNotification.refresh();
    } catch { /* stay */ }
    finally { this.actioning.set(null); }
  }

  severityClass(s?: string): string {
    if (!s) return 'badge-neutral';
    const upper = s.toUpperCase();
    if (upper === 'CRITICAL' || upper === 'HIGH') return 'badge-danger';
    if (upper === 'MEDIUM')                        return 'badge-warning';
    return 'badge-brand';
  }

  severityLabel(s?: string): string {
    const map: Record<string, string> = {
      CRITICAL: 'Crítica', HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja',
    };
    return s ? (map[s.toUpperCase()] ?? s) : '—';
  }

  typeLabel(t?: string): string {
    const map: Record<string, string> = {
      LOW_STOCK:    'Bajo stock',
      OVERSTOCK:    'Sobrestock',
      EXPIRY:       'Vencimiento',
      WASTE_SPIKE:  'Pico de merma',
    };
    return t ? (map[t] ?? t.replace(/_/g, ' ')) : '—';
  }

  readonly formatDate = formatDate;

  isActioning(id?: string): boolean {
    return id != null && this.actioning() === id;
  }

  unreadCount(): number {
    return this.alerts().filter(a => !a.isRead).length;
  }
}
