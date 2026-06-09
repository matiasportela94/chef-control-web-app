import { Injectable, signal } from '@angular/core';
import { Api } from '../../api/api';
import { list4 } from '../../api/fn/alert-controller/list-4';
import { PagedResponseAlertResponse } from '../../api/models/paged-response-alert-response';
import { parseBlob } from '../utils/parse-blob';

@Injectable({ providedIn: 'root' })
export class AlertNotificationService {
  readonly unreadCount = signal(0);

  constructor(private api: Api) {}

  async refresh(): Promise<void> {
    try {
      const raw = await this.api.invoke(list4, { page: 0, size: 100 }) as unknown;
      const res = await parseBlob<PagedResponseAlertResponse>(raw);
      const count = (res.content ?? []).filter(a => !a.isRead && !a.resolvedAt).length;
      this.unreadCount.set(count);
    } catch { /* non-critical */ }
  }
}
