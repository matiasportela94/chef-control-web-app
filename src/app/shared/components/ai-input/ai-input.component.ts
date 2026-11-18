import { Component, ElementRef, EventEmitter, Injector, Input, OnDestroy, Output, ViewChild, afterNextRender, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../../api/api';
import { transcribeAudio } from '../../../api/fn/ai-controller/transcribe-audio';
import { TranscriptionResponse } from '../../../api/models/transcription-response';
import { sendChatMessage } from '../../../api/fn/ai-chat-controller/send-chat-message';
import { confirmChatOperations } from '../../../api/fn/ai-chat-controller/confirm-chat-operations';
import { undoChatAction } from '../../../api/fn/ai-chat-controller/undo-chat-action';
import { ChatActionResponse } from '../../../api/models/chat-action-response';
import { ChatOperationItem } from '../../../api/models/chat-operation-item';
import { ChatResponse } from '../../../api/models/chat-response';
import { ChatSkip } from '../../../api/models/chat-skip';
import { parseBlob } from '../../../core/utils/parse-blob';
import { extractApiError } from '../../../core/utils/api-error';
import { getErrorMessage } from '../../../core/utils/error-messages';
import { formatARS, formatNum } from '../../../core/utils/format';
import { AiRefreshService } from '../../../core/services/ai-refresh.service';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { DrawerComponent } from '../drawer/drawer.component';

/** Se corta solo a los 2 min. A 64 kbps son ~1 MB, lejos del tope del back (4 MB, AI_AUDIO_TOO_LARGE). */
const MAX_RECORDING_SECONDS = 120;
const AUDIO_BITS_PER_SECOND = 64000;
/** Chrome y Android graban webm; Safari de iOS, mp4. El primero que soporte el navegador. */
const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

/** Pasado el plazo, o si la cargó otro, deshacer pide el permiso de borrar de su pantalla. */
const UNDO_PERMISSION: Record<string, string> = {
  PURCHASE: 'PURCHASES_DELETE', WASTE: 'STOCK_DELETE', STOCK_ADJUSTMENT: 'STOCK_DELETE',
  SALE: 'SALES_DELETE', PRODUCTION: 'PRODUCTIONS_DELETE',
};

const STATUS_ICON: Record<string, string> = {
  REGISTERED: 'ti-circle-check', NEEDS_CONFIRMATION: 'ti-help-circle', NOT_REGISTERED: 'ti-circle-x',
  NOT_SUPPORTED: 'ti-info-circle', NOT_UNDERSTOOD: 'ti-question-mark',
};

/** `deadline`: hasta cuándo se deshace sin permiso, en el reloj de este navegador (ver `track`). */
interface ChatAction extends ChatActionResponse {
  deadline: number;
  undoing?: boolean;
  undoError?: string;
  /** El back dijo que no (CHAT_UNDO_NOT_ALLOWED): reintentar no sirve, aunque la sesión diga que hay permiso. */
  undoBlocked?: boolean;
}

/** Un mensaje del usuario y cómo quedó. Cada uno se entiende solo: la IA no ve los anteriores. */
interface ChatTurn {
  id: number;
  text: string;
  status: 'pending' | 'done' | 'error';
  error?: string;
  response?: ChatResponse;
  actions?: ChatAction[];
  confirming?: boolean;
  confirmError?: string;
  cancelled?: boolean;
}

@Component({
  selector: 'app-ai-input',
  standalone: true,
  imports: [FormsModule, DrawerComponent, RouterLink, DatePipe],
  templateUrl: './ai-input.component.html',
  styleUrl: './ai-input.component.scss',
})
export class AiInputComponent implements OnDestroy {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('box') private box?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('end') private end?: ElementRef<HTMLElement>;

  message = '';
  /** El historial vive mientras viva el shell: salir a /login (logout o cambio de local) lo descarta. */
  turns   = signal<ChatTurn[]>([]);
  sending = computed(() => this.turns().some(t => t.status === 'pending'));
  private nextId = 0;
  /** Mueve los botones de deshacer cuando vence su plazo. */
  now = signal(Date.now());
  private timers: ReturnType<typeof setTimeout>[] = [];

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

  readonly examples = [
    { icon: 'ti-shopping-cart',   key: 'purchase' },
    { icon: 'ti-chart-bar',       key: 'sales' },
    { icon: 'ti-trash',           key: 'waste' },
    { icon: 'ti-clipboard-check', key: 'stockCount' },
  ] as const;

  constructor(private api: Api, private aiRefresh: AiRefreshService, private auth: AuthService,
              private i18n: I18nService, private injector: Injector) {}

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  /** Plan sin la IA (plan gratis): en lugar del chat, el aviso de plan, como /food-cost. */
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
    this.timers.forEach(clearTimeout);
  }

  // ---------------------------------------------------------------- chat

  /** Enter manda; Shift+Enter es una línea nueva. Con un IME a mitad de una palabra, Enter es del IME. */
  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void this.send(); }
  }

  canSend(): boolean {
    return !!this.message.trim() && !this.sending() && !this.recording() && !this.transcribing();
  }

  async send(): Promise<void> {
    if (!this.canSend()) return;
    const turn: ChatTurn = { id: this.nextId++, text: this.message.trim(), status: 'pending' };
    this.message = '';
    this.voiceError.set(null);
    this.turns.update(ts => [...ts, turn]);
    await this.run(turn);
  }

  retry(turn: ChatTurn): void {
    if (this.sending()) return;
    this.patch(turn.id, { status: 'pending', error: undefined });
    void this.run(turn);
  }

  /** Vuelve a poner el texto en la caja para corregirlo y mandarlo de nuevo, completo. */
  edit(turn: ChatTurn): void {
    this.message = turn.text;
    this.box?.nativeElement.focus();
  }

  private async run(turn: ChatTurn): Promise<void> {
    this.scrollToEnd();
    try {
      const res = await parseBlob<ChatResponse>(await this.api.invoke(sendChatMessage, { body: { message: turn.text } }) as unknown);
      this.receive(turn.id, res);
      this.patch(turn.id, { status: 'done' });
    } catch (e) {
      // Un fallo del modelo llega como 200 NOT_UNDERSTOOD; acá cae lo demás (red, sesión, plan).
      this.patch(turn.id, { status: 'error', error: extractApiError(e, this.t('ai.error')) });
    }
    this.scrollToEnd();
  }

  /** La propuesta va tal cual: el back la revalida entera. Para cambiarla, "Corregir" y mandar el mensaje de nuevo. */
  async confirm(turn: ChatTurn): Promise<void> {
    const operations = turn.response?.proposal;
    if (!operations?.length || turn.confirming) return;
    this.patch(turn.id, { confirming: true, confirmError: undefined });
    try {
      this.receive(turn.id, await parseBlob<ChatResponse>(await this.api.invoke(confirmChatOperations, { body: { operations } }) as unknown));
    } catch (e) {
      this.patch(turn.id, { confirmError: extractApiError(e, this.t('ai.confirmError')) });
    } finally {
      this.patch(turn.id, { confirming: false });
    }
    this.scrollToEnd();
  }

  cancel(turn: ChatTurn): void {
    this.patch(turn.id, { cancelled: true });
  }

  private receive(turnId: number, res: ChatResponse): void {
    this.patch(turnId, { response: res, actions: (res.actions ?? []).map(a => this.track(a)) });
    if (res.actions?.length) this.aiRefresh.notify();
  }

  /**
   * El plazo se cuenta desde que llegó la respuesta (15 min = undoableUntil − createdAt), no con la hora del server:
   * con el reloj del celular corrido, comparar contra undoableUntil apagaría el botón antes o después de tiempo.
   * Al vencer, un timer mueve `now` y el botón se apaga solo.
   */
  private track(action: ChatActionResponse): ChatAction {
    const window = Date.parse(action.undoableUntil ?? '') - Date.parse(action.createdAt ?? '');
    const deadline = Number.isFinite(window) ? Date.now() + window : 0;
    if (deadline > Date.now()) this.timers.push(setTimeout(() => this.now.set(Date.now()), deadline - Date.now() + 100));
    return { ...action, deadline };
  }

  canUndo(a: ChatAction): boolean {
    return !a.undoneAt && !a.undoBlocked && (this.now() < a.deadline || this.auth.hasPermission(UNDO_PERMISSION[a.type ?? ''] ?? ''));
  }

  async undo(turn: ChatTurn, a: ChatAction): Promise<void> {
    const id = a.actionId;
    if (!id || a.undoing) return;
    this.patchAction(turn.id, id, { undoing: true, undoError: undefined });
    try {
      const res = await parseBlob<ChatActionResponse>(await this.api.invoke(undoChatAction, { actionId: id }) as unknown);
      this.patchAction(turn.id, id, { undoneAt: res.undoneAt });
      this.aiRefresh.notify();
    } catch (e: any) {
      const code = e?.error?.errorCode;
      if (code === 'CHAT_ACTION_ALREADY_UNDONE') {
        this.patchAction(turn.id, id, { undoneAt: new Date().toISOString() });
      } else {
        this.patchAction(turn.id, id, { undoError: extractApiError(e, this.t('ai.undoError')), undoBlocked: code === 'CHAT_UNDO_NOT_ALLOWED' });
      }
    } finally {
      this.patchAction(turn.id, id, { undoing: false });
    }
  }

  private patch(id: number, changes: Partial<ChatTurn>): void {
    this.turns.update(ts => ts.map(t => t.id === id ? { ...t, ...changes } : t));
  }

  private patchAction(turnId: number, actionId: string, changes: Partial<ChatAction>): void {
    this.turns.update(ts => ts.map(t => t.id !== turnId ? t
      : { ...t, actions: t.actions?.map(a => a.actionId === actionId ? { ...a, ...changes } : a) }));
  }

  /** Después de dibujar: con eventCoalescing la vista nueva recién está en el frame siguiente. */
  private scrollToEnd(): void {
    afterNextRender(() => this.end?.nativeElement.scrollIntoView({ block: 'end' }), { injector: this.injector });
  }

  statusIcon(status?: string): string {
    return STATUS_ICON[status ?? ''] ?? 'ti-info-circle';
  }

  itemLine(type: string | undefined, it: ChatOperationItem): string {
    const item = [formatNum(it.quantity), it.unitName, it.name].filter(Boolean).join(' ');
    return type === 'PURCHASE' && it.pricePerUnit != null
      ? this.t('ai.itemPrice', { item, price: formatARS(it.pricePerUnit), unit: it.unitName ?? '' })
      : item;
  }

  skipMessage(s: ChatSkip): string {
    return getErrorMessage(s.errorCode) ?? s.message ?? '';
  }

  fillExample(key: string): void {
    this.message = this.t(`ai.examples.${key}`);
    this.box?.nativeElement.focus();
  }

  close(): void {
    this.stopRecording(true);
    this.transcribing.set(false);
    this.closed.emit();
  }

  // ---------------------------------------------------------------- dictado

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

  /** El texto va a la caja para revisarlo: no se manda solo. Si ya había algo escrito, se suma al final. */
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
}
