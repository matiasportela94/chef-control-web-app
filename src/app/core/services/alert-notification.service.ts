import { Injectable, signal } from '@angular/core';
import { Api } from '../../api/api';
import { listAlerts } from '../../api/fn/alert-controller/list-alerts';
import { PagedResponseAlertResponse } from '../../api/models/paged-response-alert-response';
import { parseBlob } from '../utils/parse-blob';

@Injectable({ providedIn: 'root' })
export class AlertNotificationService {
  readonly unreadCount = signal(0);

  constructor(private api: Api) {}

  async refresh(): Promise<void> {
    try {
      const raw = await this.api.invoke(listAlerts, { page: 0, size: 100 }) as unknown;
      const res = await parseBlob<PagedResponseAlertResponse>(raw);
      const count = (res.content ?? []).filter(a => !a.isRead && !a.resolvedAt).length;
      this.unreadCount.set(count);
    } catch { /* non-critical */ }
  }
}
