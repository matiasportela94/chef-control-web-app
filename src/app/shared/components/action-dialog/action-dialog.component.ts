import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-action-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div *ngIf="visible" style="position:fixed;inset:0;z-index:450;overflow-y:auto;background:rgba(0,0,0,.6);"
         (click)="cancel.emit()">
      <div style="display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;">

        <div style="position:relative;width:100%;max-width:480px;background:var(--bg-card);border-radius:18px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.2);"
             (click)="$event.stopPropagation()">

          <!-- Header -->
          <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);padding:14px 20px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:20px;"
                    [style.color]="tone === 'danger' ? 'var(--red)' : 'var(--accent)'">{{ icon }}</span>
              <h3 style="font-size:14px;font-weight:700;color:var(--text-1);">{{ title }}</h3>
            </div>
            <button type="button" (click)="cancel.emit()"
                    style="background:none;border:none;cursor:pointer;color:var(--text-3);font-size:16px;">
              <i class="ti ti-x"></i>
            </button>
          </div>

          <!-- Body -->
          <div style="padding:16px 20px;">
            <p *ngIf="message" style="margin-bottom:14px;font-size:12px;color:var(--text-2);line-height:1.6;">{{ message }}</p>

            <div *ngIf="itemTitle || itemSubtitle || itemMeta"
                 style="margin-bottom:14px;background:var(--bg-input);border-radius:10px;padding:12px 14px;">
              <p *ngIf="itemTitle" style="font-size:13px;font-weight:600;color:var(--text-1);">{{ itemTitle }}</p>
              <p *ngIf="itemSubtitle" style="margin-top:3px;font-size:11px;color:var(--text-3);">{{ itemSubtitle }}</p>
              <p *ngIf="itemMeta" style="margin-top:3px;font-size:10px;color:var(--text-3);">{{ itemMeta }}</p>
            </div>

            <div *ngIf="inputLabel" style="margin-bottom:4px;">
              <label class="field-label">{{ inputLabel }}</label>
              <textarea *ngIf="inputType === 'textarea'; else textInput"
                        [ngModel]="inputValue" (ngModelChange)="onInputChange($event)"
                        [rows]="inputRows" [placeholder]="inputPlaceholder"
                        class="field-textarea"></textarea>
              <ng-template #textInput>
                <input type="text" [ngModel]="inputValue" (ngModelChange)="onInputChange($event)"
                       [placeholder]="inputPlaceholder" class="field-input">
              </ng-template>
            </div>

            <p *ngIf="helperText" style="margin-top:10px;font-size:10px;color:var(--text-3);">{{ helperText }}</p>
          </div>

          <!-- Footer -->
          <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--border);background:var(--bg-input);">
            <button type="button" (click)="cancel.emit()" class="btn-secondary btn-sm">{{ cancelLabel }}</button>
            <button type="button" (click)="onConfirm()" [disabled]="confirmDisabled || isInputInvalid"
                    [class]="tone === 'danger' ? 'btn-danger btn-sm' : 'btn-primary btn-sm'">
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
