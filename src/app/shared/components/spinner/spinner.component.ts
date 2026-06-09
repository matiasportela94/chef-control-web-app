import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-spinner',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center py-20 gap-3">
      <div class="w-10 h-10 rounded-full border-4 border-surface-700 border-t-brand-500 animate-spin"></div>
      @if (label) {
        <p class="text-surface-500 text-sm">{{ label }}</p>
      }
    </div>
  `,
})
export class SpinnerComponent {
  @Input() label = '';
}
