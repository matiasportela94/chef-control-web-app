import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed top-24 right-4 z-[600] flex flex-col gap-3 w-80 pointer-events-none">
      <div
        *ngFor="let toast of toastService.toasts()"
        class="pointer-events-auto flex items-start gap-3 bg-surface-900 border-l-[3px] rounded-r-xl px-4 py-3.5 shadow-2xl"
        [ngClass]="{
          'border-success-400': toast.type === 'success',
          'border-danger-500':  toast.type === 'error',
          'border-warning-400': toast.type === 'warning',
          'border-brand-500':   toast.type === 'info'
        }"
      >
        <span
          class="text-lg flex-shrink-0 mt-0.5"
          [ngClass]="{
            'text-success-400': toast.type === 'success',
            'text-danger-500':  toast.type === 'error',
            'text-warning-400': toast.type === 'warning',
            'text-brand-300':   toast.type === 'info'
          }"
        >
          {{ toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : toast.type === 'warning' ? '⚠' : 'ℹ' }}
        </span>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold leading-snug text-white">{{ toast.title }}</p>
          <p *ngIf="toast.message" class="mt-1 text-xs leading-snug"
             [ngClass]="{
               'text-success-300': toast.type === 'success',
               'text-danger-300':  toast.type === 'error',
               'text-warning-300': toast.type === 'warning',
               'text-brand-300':   toast.type === 'info'
             }">{{ toast.message }}</p>
        </div>
        <button
          (click)="toastService.dismiss(toast.id)"
          class="text-surface-400 hover:text-white transition-colors flex-shrink-0 ml-1 -mt-0.5 -mr-1 text-lg leading-none"
        >
          ✕
        </button>
      </div>
    </div>
  `
})
export class ToastComponent {
  readonly toastService = inject(ToastService);
}
