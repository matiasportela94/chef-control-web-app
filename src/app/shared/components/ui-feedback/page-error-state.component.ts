import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-page-error-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rounded-2xl border border-danger-200 bg-white p-6 md:p-8 shadow-sm">
      <div class="mx-auto max-w-2xl text-center">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-danger-100">
          <span class="text-4xl text-danger-600">✕</span>
        </div>

        <h2 class="mt-5 text-2xl font-bold text-surface-900">{{ title }}</h2>
        <p class="mt-2 text-sm md:text-base leading-6 text-surface-600">{{ message }}</p>

        <p *ngIf="details" class="mt-4 rounded-lg bg-surface-50 px-4 py-3 text-center text-sm leading-6 text-surface-600">
          {{ details }}
        </p>

        <div *ngIf="showRetry" class="mt-6">
          <button
            type="button"
            (click)="retry.emit()"
            class="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            ↺ {{ retryLabel }}
          </button>
        </div>
      </div>
    </div>
  `
})
export class PageErrorStateComponent {
  @Input() title = 'Ocurrió un error';
  @Input() message = 'No pudimos cargar la información solicitada.';
  @Input() details = '';
  @Input() showRetry = false;
  @Input() retryLabel = 'Reintentar';
  @Output() retry = new EventEmitter<void>();
}
