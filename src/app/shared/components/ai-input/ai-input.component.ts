import { Component, EventEmitter, Input, OnDestroy, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../../api/api';
import { interpret as interpretText } from '../../../api/fn/ai-controller/interpret';
import { execute as executeIntent } from '../../../api/fn/ai-controller/execute';
import { transcribeAudio } from '../../../api/fn/ai-controller/transcribe-audio';
import { TranscriptionResponse } from '../../../api/models/transcription-response';
import { InterpretResponse as InterpretTextResponse } from '../../../api/models/interpret-response';
import { ExecuteResponse as ExecuteIntentResponse } from '../../../api/models/execute-response';
import { parseBlob } from '../../../core/utils/parse-blob';
import { extractApiError } from '../../../core/utils/api-error';
import { AiRefreshService } from '../../../core/services/ai-refresh.service';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { DrawerComponent } from '../drawer/drawer.component';

const EXECUTABLE_INTENTS = new Set(['purchase', 'waste', 'sale', 'stock_adjustment']);
/** Se corta solo a los 2 min. A 64 kbps son ~1 MB, lejos del tope del back (4 MB, AI_AUDIO_TOO_LARGE). */
const MAX_RECORDING_SECONDS = 120;
const AUDIO_BITS_PER_SECOND = 64000;
/** Chrome y Android graban webm; Safari de iOS, mp4. El primero que soporte el navegador. */
const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

@Component({
  selector: 'app-ai-input',
  standalone: true,
  imports: [FormsModule, DrawerComponent, RouterLink],
  templateUrl: './ai-input.component.html',
  styleUrl: './ai-input.component.scss',
})
export class AiInputComponent implements OnDestroy {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();

  message        = '';
  clarification  = '';
  loading        = signal(false);
  confirming     = signal(false);
  error          = signal<string | null>(null);
  result         = signal<InterpretTextResponse | null>(null);
  executeResult  = signal<ExecuteIntentResponse | null>(null);

  // ---- dictado: tocar para grabar, tocar para cortar (manos ocupadas: nada de mantener apretado)
  recording    = signal(false);
  transcribing = signal(false);
  elapsed      = signal(0);
  voiceError   = signal<string | null>(null);
  /** El back no tiene la transcripción configurada: el micrófono queda deshabilitado, reintentar no sirve. */
  voiceUnavailable = signal(false);
  readonly maxSeconds = MAX_RECORDING_SECONDS;
  private recorder?: MediaRecorder;
  private ticker?: ReturnType<typeof setInterval>;
  /** Cerrar el drawer descarta lo que se esté grabando o transcribiendo. */
  private voiceRun = 0;

  readonly shortcuts = [
    { icon: 'ti-shopping-cart',   label: 'Registrar compra de insumo', prompt: 'Compramos 5kg de pollo a $8000 al proveedor El Campo' },
    { icon: 'ti-chart-bar',       label: 'Registrar ventas del día',    prompt: 'Vendimos 3 Caesar Tradicional y 2 American Burger' },
    { icon: 'ti-trash',           label: 'Cargar merma o pérdida',      prompt: 'Se rompieron 2 botellas de aceite de oliva 500ml' },
    { icon: 'ti-clipboard-check', label: 'Actualizar stock / conteo',   prompt: 'Hicimos conteo: tenemos 12kg de papa, 8kg de pollo' },
  ] as const;

  constructor(private api: Api, private aiRefresh: AiRefreshService, private auth: AuthService, private i18n: I18nService) {}

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  /** Plan sin la IA (plan gratis): en lugar del formulario, el aviso de plan, como /food-cost. */
  get planLocked(): boolean {
    return !this.auth.hasFeature('AI_INTERPRETER');
  }

  /** `/plan` pide ACCOUNT_VIEW: sin eso el link rebotaría. */
  get canSeePlans(): boolean {
    return this.auth.hasPermission('ACCOUNT_VIEW');
  }

  /** Sin MediaRecorder/getUserMedia (navegador viejo, o http fuera de localhost) o sin la IA, no se ofrece. */
  get canRecord(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
      && this.auth.hasFeature('AI_INTERPRETER') && this.auth.hasPermission('AI_USE');
  }

  ngOnDestroy(): void {
    this.stopRecording(true);
  }

  async toggleRecording(): Promise<void> {
    if (this.recording()) { this.stopRecording(false); return; }
    if (this.transcribing() || this.voiceUnavailable()) return;
    this.voiceError.set(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e: any) {
      const key = e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'ai.voice.permissionDenied'
        : e?.name === 'NotFoundError' ? 'ai.voice.noMicrophone' : 'ai.voice.micError';
      this.voiceError.set(this.t(key));
      return;
    }
    const run = this.voiceRun;
    const mimeType = AUDIO_TYPES.find(type => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
    const chunks: Blob[] = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());
      clearInterval(this.ticker);
      this.recording.set(false);
      if (run === this.voiceRun) void this.transcribe(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }), run);
    };
    const started = Date.now();
    this.elapsed.set(0);
    this.ticker = setInterval(() => {
      this.elapsed.set(Math.min(MAX_RECORDING_SECONDS, Math.floor((Date.now() - started) / 1000)));
      if (Date.now() - started >= MAX_RECORDING_SECONDS * 1000) this.stopRecording(false);
    }, 250);
    this.recorder = recorder;
    recorder.start();
    this.recording.set(true);
  }

  private stopRecording(discard: boolean): void {
    if (discard) this.voiceRun++;
    if (this.recorder?.state === 'recording') this.recorder.stop();
  }

  /** El texto va al mensaje para revisarlo: no se interpreta solo. Si ya había algo escrito, se suma al final. */
  private async transcribe(audio: Blob, run: number): Promise<void> {
    if (!audio.size) { this.voiceError.set(this.t('ai.voice.nothingRecorded')); return; }
    this.transcribing.set(true);
    try {
      // Un File para que la parte lleve nombre; el back reconoce el formato por los bytes, no por el nombre.
      const file = new File([audio], audio.type.includes('mp4') ? 'dictado.mp4' : 'dictado.webm', { type: audio.type });
      const res = await parseBlob<TranscriptionResponse>(await this.api.invoke(transcribeAudio, { body: { audio: file } }) as unknown);
      if (run !== this.voiceRun) return;
      const text = res?.text?.trim();
      if (!text) { this.voiceError.set(this.t('ai.voice.nothingHeard')); return; }
      this.message = this.message.trim() ? `${this.message.trim()} ${text}` : text;
    } catch (e: any) {
      if (e?.error?.errorCode === 'AI_TRANSCRIPTION_NOT_CONFIGURED') this.voiceUnavailable.set(true);
      if (run === this.voiceRun) this.voiceError.set(extractApiError(e, this.t('ai.voice.error')));
    } finally {
      if (run === this.voiceRun) this.transcribing.set(false);
    }
  }

  clock(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  fillShortcut(text: string): void {
    this.message = text;
  }

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
        body: { intent: r.intent, data: r.data as Record<string, object> ?? {} }
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
    this.voiceError.set(null);
    this.retry();
  }

  close(): void {
    this.stopRecording(true);
    this.transcribing.set(false);
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
