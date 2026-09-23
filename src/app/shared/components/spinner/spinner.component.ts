import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-spinner',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center py-20 gap-3">
      <div style="width:36px;height:36px;border-radius:50%;border:3px solid var(--border);border-top-color:var(--accent);" class="animate-spin"></div>
      @if (label) {
        <p style="font-size:12px;color:var(--text-3);">{{ label }}</p>
      }
    </div>
  `,
})
export class SpinnerComponent {
  @Input() label = '';
}
