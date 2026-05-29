import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-action-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div
      *ngIf="visible"
      class="fixed inset-0 z-[450] overflow-y-auto"
      (click)="cancel.emit()"
    >
      <div class="flex min-h-screen items-center justify-center px-2 py-4 md:px-4">
        <div class="fixed inset-0 bg-surface-900/75"></div>

        <div
          class="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white text-left shadow-xl"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-center justify-between border-b border-surface-200 px-4 py-3 md:px-6 md:py-4">
            <div class="flex items-center gap-3">
              <span
                class="text-2xl"
                [class.text-brand-600]="tone === 'primary'"
                [class.text-danger-500]="tone === 'danger'"
              >
                {{ icon }}
              </span>
              <h3 class="text-base font-semibold text-surface-900 md:text-lg">{{ title }}</h3>
            </div>

            <button type="button" (click)="cancel.emit()" class="text-surface-400 hover:text-surface-600 text-xl leading-none">✕</button>
          </div>

          <div class="px-4 py-4 md:px-6">
            <p *ngIf="message" class="mb-4 text-sm text-surface-600">{{ message }}</p>

            <div *ngIf="itemTitle || itemSubtitle || itemMeta" class="mb-4 rounded-lg bg-surface-50 p-4">
              <p *ngIf="itemTitle" class="font-semibold text-surface-900">{{ itemTitle }}</p>
              <p *ngIf="itemSubtitle" class="mt-1 text-sm text-surface-500">{{ itemSubtitle }}</p>
              <p *ngIf="itemMeta" class="mt-1 text-xs text-surface-500">{{ itemMeta }}</p>
            </div>

            <div *ngIf="inputLabel" class="space-y-2">
              <label class="block text-sm font-medium text-surface-900">{{ inputLabel }}</label>

              <textarea
                *ngIf="inputType === 'textarea'; else textInput"
                [ngModel]="inputValue"
                (ngModelChange)="onInputChange($event)"
                [rows]="inputRows"
                [placeholder]="inputPlaceholder"
                class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 outline-none transition-colors placeholder:text-surface-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
              ></textarea>

              <ng-template #textInput>
                <input
                  type="text"
                  [ngModel]="inputValue"
                  (ngModelChange)="onInputChange($event)"
                  [placeholder]="inputPlaceholder"
                  class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 outline-none transition-colors placeholder:text-surface-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                />
              </ng-template>
            </div>

            <p *ngIf="helperText" class="mt-3 text-xs text-surface-500">{{ helperText }}</p>
          </div>

          <div class="flex flex-col items-stretch justify-end gap-2 bg-surface-50 px-4 py-3 md:flex-row md:items-center md:gap-3 md:px-6 md:py-4">
            <button
              type="button"
              (click)="cancel.emit()"
              class="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-100"
            >
              {{ cancelLabel }}
            </button>

            <button
              type="button"
              (click)="onConfirm()"
              [disabled]="confirmDisabled || isInputInvalid"
              [class.bg-brand-600]="tone === 'primary'"
              [class.hover:bg-brand-700]="tone === 'primary'"
              [class.bg-danger-500]="tone === 'danger'"
              [class.hover:bg-danger-600]="tone === 'danger'"
              class="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ActionDialogComponent {
  @Input() visible = false;
  @Input() title = 'Confirmar acción';
  @Input() message = '';
  @Input() confirmLabel = 'Confirmar';
  @Input() cancelLabel = 'Cancelar';
  @Input() tone: 'primary' | 'danger' = 'primary';
  @Input() icon = '?';
  @Input() itemTitle = '';
  @Input() itemSubtitle = '';
  @Input() itemMeta = '';
  @Input() helperText = '';
  @Input() inputLabel = '';
  @Input() inputPlaceholder = '';
  @Input() inputType: 'text' | 'textarea' = 'text';
  @Input() inputRows = 3;
  @Input() inputValue = '';
  @Input() inputRequired = false;
  @Input() confirmDisabled = false;

  @Output() cancel = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<string>();
  @Output() inputValueChange = new EventEmitter<string>();

  get isInputInvalid(): boolean {
    return this.inputRequired && !this.inputValue.trim();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible) this.cancel.emit();
  }

  onInputChange(value: string): void {
    this.inputValueChange.emit(value);
  }

  onConfirm(): void {
    if (this.confirmDisabled || this.isInputInvalid) return;
    this.confirm.emit(this.inputValue.trim());
  }
}
