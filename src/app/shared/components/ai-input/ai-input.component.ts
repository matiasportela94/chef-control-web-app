import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../../api/api';
import { interpretText } from '../../../api/fn/ai-controller/interpret-text';
import { InterpretTextResponse } from '../../../api/models/interpret-text-response';
import { parseBlob } from '../../../core/utils/parse-blob';
import { extractApiError } from '../../../core/utils/api-error';

@Component({
  selector: 'app-ai-input',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './ai-input.component.html',
})
export class AiInputComponent {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();

  message = '';
  loading = signal(false);
  error   = signal<string | null>(null);
  result  = signal<InterpretTextResponse | null>(null);

  constructor(private api: Api) {}

  onKeydown(e: KeyboardEvent): void {
    if (e.ctrlKey && e.key === 'Enter') void this.interpret();
  }

  async interpret(): Promise<void> {
    const msg = this.message.trim();
    if (!msg || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);
    try {
      const raw = await this.api.invoke(interpretText, { body: { message: msg } }) as unknown;
      this.result.set(await parseBlob<InterpretTextResponse>(raw));
    } catch (e) {
      this.error.set(extractApiError(e, 'No se pudo interpretar el mensaje'));
    } finally {
      this.loading.set(false);
    }
  }

  close(): void {
    this.closed.emit();
    this.message = '';
    this.result.set(null);
    this.error.set(null);
  }

  intentLabel(intent?: string): string {
    const map: Record<string, string> = {
      purchase:        'Compra',
      waste:           'Merma',
      sale:            'Venta',
      stock_adjustment: 'Ajuste de stock',
      query:           'Consulta',
      multi:           'Múltiple',
      unknown:         'Desconocido',
    };
    return intent ? (map[intent] ?? intent) : '—';
  }

  intentBadgeClass(intent?: string): string {
    const map: Record<string, string> = {
      purchase:        'bg-brand-500/20 text-brand-300',
      waste:           'bg-warning-500/20 text-warning-300',
      sale:            'bg-success-500/20 text-success-300',
      stock_adjustment: 'bg-purple-500/20 text-purple-300',
      query:           'bg-surface-600 text-surface-300',
      multi:           'bg-brand-500/20 text-brand-300',
      unknown:         'bg-danger-500/20 text-danger-300',
    };
    return intent ? (map[intent] ?? 'bg-surface-600 text-surface-300') : '';
  }

  confidenceBarClass(confidence?: number): string {
    if (!confidence) return 'bg-danger-500';
    if (confidence >= 80) return 'bg-success-500';
    if (confidence >= 60) return 'bg-warning-500';
    return 'bg-danger-500';
  }
}
