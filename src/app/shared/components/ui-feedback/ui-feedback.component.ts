import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { UiFeedbackService } from '../../../core/services/ui-feedback.service';

@Component({
  selector: 'app-ui-feedback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container *ngIf="isVisible()">
      <div class="fixed inset-0 z-[500] bg-surface-950/50 backdrop-blur-[2px]"></div>

      <div class="pointer-events-none fixed inset-0 z-[510] flex items-center justify-center px-4 py-6">
        <div
          class="pointer-events-auto w-full max-w-md rounded-2xl border border-surface-200 bg-white shadow-[0_32px_90px_rgba(15,23,42,0.28)]"
          [class.max-w-sm]="isLoading()"
        >
          <div class="flex flex-col items-center px-6 py-8 text-center" *ngIf="isLoading(); else resultState">
            <div class="h-14 w-14 animate-spin rounded-full border-4 border-surface-200 border-t-brand-600"></div>
            <h3 class="mt-5 text-xl font-semibold text-surface-900">{{ state().title }}</h3>
            <p class="mt-2 text-sm leading-6 text-surface-600">{{ state().message }}</p>
          </div>

          <ng-template #resultState>
            <div class="px-6 py-7 text-center">
              <div
                class="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
                [class.bg-success-100]="isSuccess()"
                [class.bg-danger-100]="isError()"
              >
                <span
                  class="text-4xl"
                  [class.text-success-600]="isSuccess()"
                  [class.text-danger-600]="isError()"
                >
                  {{ isSuccess() ? '✓' : '✕' }}
                </span>
              </div>

              <h3 class="mt-5 text-xl font-semibold text-surface-900">{{ state().title }}</h3>
              <p class="mt-2 text-sm leading-6 text-surface-600">{{ state().message }}</p>
              <p *ngIf="state().details" class="mt-3 rounded-xl bg-surface-50 px-4 py-3 text-left text-sm leading-6 text-surface-600">
                {{ state().details }}
              </p>
            </div>

            <div class="border-t border-surface-200 px-6 py-4">
              <div class="flex gap-3" [class.flex-col]="!state().onRetry">
                <button
                  *ngIf="state().onRetry"
                  type="button"
                  (click)="retry()"
                  class="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                >
                  {{ state().retryLabel || 'Reintentar' }}
                </button>
                <button
                  type="button"
                  (click)="close()"
                  class="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-50"
                  [class.flex-1]="state().onRetry"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </ng-template>
        </div>
      </div>
    </ng-container>
  `
})
export class UiFeedbackComponent {
  private readonly feedbackService = inject(UiFeedbackService);

  readonly state = this.feedbackService.state;
  readonly isVisible = computed(() => this.state().status !== 'idle');
  readonly isLoading = computed(() => this.state().status === 'loading');
  readonly isSuccess = computed(() => this.state().status === 'success');
  readonly isError = computed(() => this.state().status === 'error');

  close(): void {
    if (this.isLoading()) return;
    const closeHandler = this.state().onClose;
    this.feedbackService.reset();
    closeHandler?.();
  }

  retry(): void {
    const retryHandler = this.state().onRetry;
    if (!retryHandler) return;
    this.feedbackService.reset();
    retryHandler();
  }
}
