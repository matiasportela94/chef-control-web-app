import { Component, inject } from '@angular/core';
import { MaintenanceService } from '../../core/services/maintenance.service';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-maintenance',
  standalone: true,
  templateUrl: './maintenance.component.html',
})
export class MaintenanceComponent {
  private readonly i18n = inject(I18nService);
  readonly maintenance = inject(MaintenanceService);

  t(key: string): string {
    return this.i18n.t(key);
  }
}
