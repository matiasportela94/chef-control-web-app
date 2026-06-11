import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../../api/api';
import { interpretText } from '../../../api/fn/ai-controller/interpret-text';
import { executeIntent } from '../../../api/fn/ai-controller/execute-intent';
import { InterpretTextResponse } from '../../../api/models/interpret-text-response';
import { ExecuteIntentResponse } from '../../../api/models/execute-intent-response';
import { parseBlob } from '../../../core/utils/parse-blob';
import { extractApiError } from '../../../core/utils/api-error';
import { AiRefreshService } from '../../../core/services/ai-refresh.service';

const EXECUTABLE_INTENTS = new Set(['purchase', 'waste', 'sale', 'stock_adjustment']);

@Component({
  selector: 'app-ai-input',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './ai-input.component.html',
})
export class AiInputComponent {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();

  message        = '';
  clarification  = '';
  loading        = signal(false);
  confirming     = signal(false);
  error          = signal<string | null>(null);
  result         = signal<InterpretTextResponse | null>(null);
  executeResult  = signal<ExecuteIntentResponse | null>(null);

  constructor(private api: Api, private aiRefresh: AiRefreshService) {}

  onKeydown(e: KeyboardEvent): void {
    if (e.ctrlKey && e.key === 'Enter') void this.interpret();
  }

  onClarificationKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void this.interpretWithClarification(); }
  }

  canExecute(): boolean {
    const r = this.result();
    return !!r && EXECUTABLE_INTENTS.has(r.intent ?? '') && !this.executeResult();
  }

  async interpret(): Promise<void> {
    const msg = this.message.trim();
    if (!msg || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);
    this.executeResult.set(null);
    this.clarification = '';
    try {
      const raw = await this.api.invoke(interpretText, { body: { message: msg } }) as unknown;
      this.result.set(await parseBlob<InterpretTextResponse>(raw));
    } catch (e) {
      this.error.set(extractApiError(e, 'No se pudo interpretar el mensaje'));
    } finally {
      this.loading.set(false);
    }
  }

  async interpretWithClarification(): Promise<void> {
    const clarif = this.clarification.trim();
    if (!clarif || this.loading()) return;
    const aiQuestion = this.result()?.responseToUser ?? '';
    const combined = `${this.message.trim()}\n\n[La IA preguntó: ${aiQuestion}]\nRespuesta del usuario: ${clarif}`;
    this.message = combined;
    this.clarification = '';
    await this.interpret();
  }

  async confirm(): Promise<void> {
    const r = this.result();
    if (!r?.intent || this.confirming()) return;
    this.confirming.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.invoke(executeIntent, {
        body: { intent: r.intent, data: r.data as Record<string, unknown> ?? {} }
      }) as unknown;
      this.executeResult.set(await parseBlob<ExecuteIntentResponse>(raw));
      this.aiRefresh.notify();
    } catch (e) {
      this.error.set(extractApiError(e, 'No se pudo registrar la operación'));
    } finally {
      this.confirming.set(false);
    }
  }

  retry(): void {
    this.result.set(null);
    this.executeResult.set(null);
    this.error.set(null);
    this.clarification = '';
  }

  resetForNew(): void {
    this.message = '';
    this.retry();
  }

  close(): void {
    this.closed.emit();
    this.resetForNew();
  }

  intentLabel(intent?: string): string {
    const map: Record<string, string> = {
      purchase:         'Compra',
      waste:            'Merma',
      sale:             'Venta',
      stock_adjustment: 'Ajuste de stock',
      query:            'Consulta',
      multi:            'Múltiple',
      unknown:          'Desconocido',
    };
    return intent ? (map[intent] ?? intent) : '—';
  }

  intentBadgeClass(intent?: string): string {
    const map: Record<string, string> = {
      purchase:         'bg-brand-500/20 text-brand-300',
      waste:            'bg-warning-500/20 text-warning-300',
      sale:             'bg-success-500/20 text-success-300',
      stock_adjustment: 'bg-purple-500/20 text-purple-300',
      query:            'bg-surface-600 text-surface-300',
      multi:            'bg-brand-500/20 text-brand-300',
      unknown:          'bg-danger-500/20 text-danger-300',
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
