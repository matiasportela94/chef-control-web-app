import { Component, ElementRef, EventEmitter, HostListener, Input, Output, booleanAttribute, forwardRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => SelectComponent),
    multi: true,
  }],
  template: `
    <button type="button"
            class="select-trigger"
            [class.compact]="compact"
            [class.invalid]="invalid"
            [disabled]="isDisabled()"
            (click)="toggle($event)">
      <span class="select-trigger-label" [class.placeholder]="!selectedLabel()">{{ selectedLabel() || placeholder }}</span>
      <i class="ti ti-chevron-down" [style.transform]="open() ? 'rotate(180deg)' : 'rotate(0deg)'"></i>
    </button>

    @if (open()) {
      <div class="select-panel">
        @if (placeholder) {
          <button type="button" class="select-option" [class.selected]="value() === ''" (click)="choose('')">
            {{ placeholder }}
          </button>
        }
        @for (opt of options; track opt.value) {
          <button type="button" class="select-option" [class.selected]="opt.value === value()" (click)="choose(opt.value)">
            {{ opt.label }}
          </button>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: block; position: relative; }
    .select-panel::-webkit-scrollbar { width: 4px; }
    .select-panel::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
  `],
})
export class SelectComponent implements ControlValueAccessor {
  @Input() options: SelectOption[] = [];
  @Input() placeholder = '';
  @Input({ transform: booleanAttribute }) invalid = false;
  @Input({ transform: booleanAttribute }) compact = false;

  @Input()
  set disabled(v: boolean) {
    this.disabledInput.set(v);
  }
  get disabled(): boolean {
    return this.disabledInput();
  }

  @Output() change = new EventEmitter<string>();

  open = signal(false);
  value = signal('');

  private disabledInput = signal(false);
  private cvaDisabled = signal(false);

  private onChangeFn: (v: string) => void = () => {};
  private onTouchedFn: () => void = () => {};

  constructor(private el: ElementRef<HTMLElement>) {}

  isDisabled(): boolean {
    return this.disabledInput() || this.cvaDisabled();
  }

  selectedLabel(): string {
    return this.options.find(o => o.value === this.value())?.label ?? '';
  }

  toggle(e: Event): void {
    e.stopPropagation();
    if (this.isDisabled()) return;
    this.open.update(v => !v);
    if (this.open()) this.onTouchedFn();
  }

  choose(v: string): void {
    this.value.set(v);
    this.open.set(false);
    this.onChangeFn(v);
    this.change.emit(v);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: Event): void {
    if (!this.el.nativeElement.contains(e.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }

  writeValue(v: string | null): void {
    this.value.set(v ?? '');
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChangeFn = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouchedFn = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }
}
