import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="position:fixed;top:68px;right:16px;z-index:600;display:flex;flex-direction:column;gap:10px;width:300px;pointer-events:none;">
      <div
        *ngFor="let toast of toastService.toasts()"
        style="pointer-events:auto;display:flex;align-items:flex-start;gap:10px;
               background:var(--bg-card);border-radius:12px;
               padding:12px 14px;box-shadow:0 8px 28px rgba(0,0,0,.12);
               border-left:3px solid;"
        [style.borderLeftColor]="toast.type === 'success' ? '#22c55e' : toast.type === 'error' ? '#E74C3C' : toast.type === 'warning' ? '#f59e0b' : 'var(--accent)'"
      >
        <i style="font-size:16px;flex-shrink:0;margin-top:1px;"
           [style.color]="toast.type === 'success' ? '#22c55e' : toast.type === 'error' ? '#E74C3C' : toast.type === 'warning' ? '#f59e0b' : 'var(--accent)'"
           [class]="toast.type === 'success' ? 'ti ti-circle-check' : toast.type === 'error' ? 'ti ti-circle-x' : toast.type === 'warning' ? 'ti ti-alert-triangle' : 'ti ti-info-circle'">
        </i>
        <div style="flex:1;min-width:0;">
          <p style="font-size:12px;font-weight:600;color:var(--text-1);line-height:1.3;">{{ toast.title }}</p>
          <p *ngIf="toast.message" style="margin-top:3px;font-size:11px;line-height:1.4;"
             [style.color]="toast.type === 'success' ? '#16a34a' : toast.type === 'error' ? '#E74C3C' : toast.type === 'warning' ? '#d97706' : 'var(--accent)'">
            {{ toast.message }}
          </p>
        </div>
        <button (click)="toastService.dismiss(toast.id)"
                style="color:var(--text-3);background:none;border:none;cursor:pointer;font-size:14px;flex-shrink:0;padding:0;line-height:1;">
          <i class="ti ti-x"></i>
        </button>
      </div>
    </div>
  `
})
export class ToastComponent {
  readonly toastService = inject(ToastService);
}
