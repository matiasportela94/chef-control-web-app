import { Component, ElementRef, EventEmitter, Injector, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, afterNextRender, computed, signal } from '@angular/core';
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
import { listChatMessages } from '../../../api/fn/ai-chat-controller/list-chat-messages';
import { startChatConversation } from '../../../api/fn/ai-chat-controller/start-chat-conversation';
import { cancelChatProposal } from '../../../api/fn/ai-chat-controller/cancel-chat-proposal';
import { ChatExchangeResponse } from '../../../api/models/chat-exchange-response';
import { ChatResponse } from '../../../api/models/chat-response';
import { parseBlob } from '../../../core/utils/parse-blob';
import { extractApiError } from '../../../core/utils/api-error';
import { formatARS, formatNum } from '../../../core/utils/format';
import { resizeImage } from '../../../core/utils/image';
import { AiRefreshService } from '../../../core/services/ai-refresh.service';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { DrawerComponent } from '../drawer/drawer.component';
import { CatalogImportComponent } from '../catalog-import/catalog-import.component';

/** Se corta solo a los 2 min. A 64 kbps son ~1 MB, lejos del tope del back (4 MB, AI_AUDIO_TOO_LARGE). */
const MAX_RECORDING_SECONDS = 120;
const AUDIO_BITS_PER_SECOND = 64000;
/** Chrome y Android graban webm; Safari de iOS, mp4. El primero que soporte el navegador. */
const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

/**
 * Adjuntos (una factura en fotos o en PDF). El multipart del back corta en 4 MB por archivo y 5 MB por pedido: se
 * valida antes de mandar, así el error dice qué archivo y por qué. Las fotos se achican, pero menos que las de los
 * platos (1200 px): tiene que leerse la letra chica de una factura.
 */
const MAX_ATTACHMENTS = 5;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const PHOTO_MAX_SIDE = 1800;
const PHOTO_QUALITY = 0.85;

interface ChatAttachment { id: number; file: File; kind: 'image' | 'pdf'; preview: string | null; }

/** Pasado el plazo, o si la cargó otro, deshacer pide el permiso de borrar de su pantalla. */
const UNDO_PERMISSION: Record<string, string> = {
  PURCHASE: 'PURCHASES_DELETE', WASTE: 'STOCK_DELETE', STOCK_ADJUSTMENT: 'STOCK_DELETE',
  SALE: 'SALES_DELETE', PRODUCTION: 'PRODUCTIONS_DELETE',
};

const STATUS_ICON: Record<string, string> = {
  REGISTERED: 'ti-circle-check', NEEDS_CONFIRMATION: 'ti-help-circle', NOT_REGISTERED: 'ti-circle-x',
  NOT_SUPPORTED: 'ti-info-circle', NOT_UNDERSTOOD: 'ti-question-mark', RECIPE_PREVIEW: 'ti-chef-hat',
};

/** `deadline`: hasta cuándo se deshace sin permiso, en el reloj de este navegador (ver `track`). */
interface ChatAction extends ChatActionResponse {
  deadline: number;
  undoing?: boolean;
  undoError?: string;
  /** El back dijo que no (CHAT_UNDO_NOT_ALLOWED): reintentar no sirve, aunque la sesión diga que hay permiso. */
  undoBlocked?: boolean;
}

/**
 * Un intercambio: el mensaje del usuario y cómo quedó. `text` es null en el resultado de un "Confirmar" o un
 * "Cancelar", que el back guarda como un intercambio aparte. `id` es el del back si vino del historial; uno local si se mandó en esta sesión.
 */
interface ChatTurn {
  id: string;
  text: string | null;
  status: 'pending' | 'done' | 'error';
  error?: string;
  response?: ChatResponse;
  actions?: ChatAction[];
  /** Lo que deshizo una corrección ("no, eran 5 kg") en este mensaje. */
  undone?: ChatAction[];
  /** La alternativa que se está confirmando; -1 mientras se cancela. */
  confirming?: number;
  confirmError?: string;
  recipeSaved?: boolean;
}

@Component({
  selector: 'app-ai-input',
  standalone: true,
  imports: [FormsModule, DrawerComponent, RouterLink, DatePipe, CatalogImportComponent],
  templateUrl: './ai-input.component.html',
  styleUrl: './ai-input.component.scss',
})
export class AiInputComponent implements OnChanges, OnDestroy {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('box') private box?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('end') private end?: ElementRef<HTMLElement>;
  @ViewChild(CatalogImportComponent) private importer?: CatalogImportComponent;

  message = '';
  /**
   * La conversación la guarda el back (por usuario y local, desde la medianoche o el último "Nueva conversación"):
   * se pide al abrir y esto es su caché. Lo que se ve tiene que ser lo que la IA recuerda.
   */
  turns   = signal<ChatTurn[]>([]);
  sending = computed(() => this.turns().some(t => t.status === 'pending' || t.confirming != null));
  loadingHistory = signal(false);
  historyError   = signal<string | null>(null);
  startingConversation = signal(false);
  conversationError    = signal<string | null>(null);
  /** Se acaba de empezar una conversación nueva: el aviso de que lo registrado sigue registrado. */
  freshConversation = signal(false);
  private nextId = 0;
  /**
   * Cuánto adelanta el reloj de este navegador respecto del back, medido con la última respuesta (createdAt ≈ ahora
   * del back). Sin eso, un celular con la hora corrida apagaría el Deshacer antes o después de tiempo.
   */
  private skew = 0;
  /** Mueve los botones de deshacer cuando vence su plazo. */
  now = signal(Date.now());
  private timers: ReturnType<typeof setTimeout>[] = [];
  /** El mensaje cuya receta está abierta en la vista previa del import. */
  recipeTurnId = signal<string | null>(null);

  // ---- adjuntos: se eligen acá y van con el próximo mensaje
  attachments = signal<ChatAttachment[]>([]);
  attachError = signal<string | null>(null);
  preparingAttachments = signal(false);
  private nextAttachmentId = 0;

  // ---- dictado: tocar para grabar, tocar para cortar (manos ocupadas: nada de mantener apretado)
  recording    = signal(false);
  transcribing = signal(false);
  elapsed      = signal(0);
  voiceError   = signal<string | null>(null);
  /** El back no tiene la transcripción configurada: el micrófono queda deshabilitado, reintentar no sirve. */
  voiceUnavailable = signal(false);
  readonly maxSeconds = MAX_RECORDING_SECONDS;
  readonly maxAttachments = MAX_ATTACHMENTS;
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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) void this.loadHistory();
  }

  ngOnDestroy(): void {
    this.attachments().forEach(a => a.preview && URL.revokeObjectURL(a.preview));
    this.stopRecording(true);
    this.timers.forEach(clearTimeout);
  }

  // ---------------------------------------------------------------- chat

  /** Enter manda; Shift+Enter es una línea nueva. Con un IME a mitad de una palabra, Enter es del IME. */
  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void this.send(); }
  }

  canSend(): boolean {
    // ponytail: con adjuntos no se manda hasta que llegue el contrato de la tanda 7 (ahí se suman al pedido).
    return !!this.message.trim() && !this.attachments().length && !this.sending() && !this.recording() && !this.transcribing()
      && !this.preparingAttachments();
  }

  /**
   * Sin `capture` a propósito: con él, el teléfono abre directo la cámara; sin él ofrece cámara, galería y archivos.
   * Las fotos se achican acá; el PDF va tal cual. Lo que no entra se avisa y lo demás se agrega igual.
   */
  async addAttachments(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';  // para poder volver a elegir el mismo archivo
    if (!files.length) return;
    this.attachError.set(null);
    this.preparingAttachments.set(true);
    const list = [...this.attachments()];
    let error: string | null = null;
    for (const original of files) {
      const name = original.name;
      const isPdf = original.type === 'application/pdf' || /\.pdf$/i.test(name);
      if (!isPdf && !original.type.startsWith('image/')) { error = this.t('ai.attach.unsupported', { name }); continue; }
      if (list.length >= MAX_ATTACHMENTS) { error = this.t('ai.attach.tooMany', { max: MAX_ATTACHMENTS }); break; }
      let file = original;
      if (!isPdf) {
        try {
          const blob = await resizeImage(original, PHOTO_MAX_SIDE, PHOTO_QUALITY);
          if (blob !== original) file = new File([blob], name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
        } catch { /* el navegador no la puede abrir (un HEIC fuera de Safari): va la original y decide el back */ }
      }
      if (file.size > MAX_FILE_BYTES) { error = this.t('ai.attach.tooBig', { name, mb: MAX_FILE_BYTES / 1024 / 1024 }); continue; }
      if (list.reduce((sum, a) => sum + a.file.size, 0) + file.size > MAX_TOTAL_BYTES) {
        error = this.t('ai.attach.totalTooBig', { mb: MAX_TOTAL_BYTES / 1024 / 1024 });
        continue;
      }
      list.push({ id: this.nextAttachmentId++, file, kind: isPdf ? 'pdf' : 'image', preview: isPdf ? null : URL.createObjectURL(file) });
    }
    this.attachments.set(list);
    this.attachError.set(error);
    this.preparingAttachments.set(false);
  }

  removeAttachment(a: ChatAttachment): void {
    if (a.preview) URL.revokeObjectURL(a.preview);
    this.attachments.update(list => list.filter(x => x.id !== a.id));
    this.attachError.set(null);
  }

  async send(): Promise<void> {
    if (!this.canSend()) return;
    const turn: ChatTurn = { id: this.localId(), text: this.message.trim(), status: 'pending' };
    this.message = '';
    this.voiceError.set(null);
    this.freshConversation.set(false);
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
    this.message = turn.text ?? '';
    this.box?.nativeElement.focus();
  }

  private async run(turn: ChatTurn): Promise<void> {
    this.scrollToEnd();
    try {
      const res = await parseBlob<ChatResponse>(await this.api.invoke(sendChatMessage, { body: { message: turn.text ?? '' } }) as unknown);
      this.receive(turn.id, res);
      this.patch(turn.id, { status: 'done' });
    } catch (e) {
      // Un fallo del modelo llega como 200 NOT_UNDERSTOOD; acá cae lo demás (red, sesión, plan).
      this.patch(turn.id, { status: 'error', error: extractApiError(e, this.t('ai.error')) });
    }
    this.scrollToEnd();
  }

  /** La conversación guardada en el back. Un mensaje que está saliendo gana: se vuelve a pedir al próximo abrir. */
  async loadHistory(): Promise<void> {
    if (this.planLocked || this.loadingHistory()) return;
    this.loadingHistory.set(true);
    this.historyError.set(null);
    try {
      const exchanges = await parseBlob<ChatExchangeResponse[]>(await this.api.invoke(listChatMessages) as unknown);
      if (!this.sending()) {
        this.timers.forEach(clearTimeout);
        this.timers = [];
        this.turns.set((exchanges ?? []).map(x => this.fromExchange(x)));
      }
    } catch (e) {
      this.historyError.set(extractApiError(e, this.t('ai.historyError')));
    } finally {
      this.loadingHistory.set(false);
    }
    this.scrollToEnd();
  }

  private fromExchange(x: ChatExchangeResponse): ChatTurn {
    const r = x.response;
    return { id: x.id ?? this.localId(), text: x.userMessage ?? null, status: 'done', response: r,
      actions: (r?.actions ?? []).map(a => this.track(a)), undone: (r?.undone ?? []).map(a => this.track(a)) };
  }

  /** Corta la memoria de la IA; no borra ni deshace nada (los mensajes quedan guardados en el back). */
  async newConversation(): Promise<void> {
    if (this.sending() || this.startingConversation()) return;
    this.startingConversation.set(true);
    this.conversationError.set(null);
    try {
      await this.api.invoke(startChatConversation);
      this.timers.forEach(clearTimeout);
      this.timers = [];
      this.turns.set([]);
      this.freshConversation.set(true);
      this.box?.nativeElement.focus();
    } catch (e) {
      this.conversationError.set(extractApiError(e, this.t('ai.newConversationError')));
    } finally {
      this.startingConversation.set(false);
    }
  }

  /**
   * Solo la última pregunta tiene botones: con memoria, una más vieja ya quedó atrás. Misma regla que el back: un
   * NOT_UNDERSTOOD no la deja atrás (un fallo del modelo no contesta nada), y tampoco un pedido que no llegó (error
   * de red: el back no lo guardó) ni uno que todavía está saliendo.
   */
  isPending(turn: ChatTurn): boolean {
    if (turn.response?.status !== 'NEEDS_CONFIRMATION' || !turn.response.proposals?.length) return false;
    const ts = this.turns();
    return ts.slice(ts.findIndex(t => t.id === turn.id) + 1)
      .every(t => t.status !== 'done' || t.response?.status === 'NOT_UNDERSTOOD');
  }

  /**
   * Cada alternativa (por kg o el total, por ejemplo) se confirma tal cual: el back la revalida entera. El resultado
   * entra como un intercambio nuevo, igual que lo guarda el back.
   */
  confirm(turn: ChatTurn, i: number): Promise<void> {
    const operations = turn.response?.proposals?.[i]?.operations;
    if (!operations?.length) return Promise.resolve();
    return this.answer(turn, i, () => this.api.invoke(confirmChatOperations, { body: { operations } }));
  }

  /** Lo guarda el back como cancelada: un "sí" después ya no la registra. */
  cancel(turn: ChatTurn): Promise<void> {
    return this.answer(turn, -1, () => this.api.invoke(cancelChatProposal));
  }

  private async answer(turn: ChatTurn, i: number, call: () => Promise<unknown>): Promise<void> {
    if (this.sending()) return;
    this.patch(turn.id, { confirming: i, confirmError: undefined });
    try {
      const res = await parseBlob<ChatResponse>(await call());
      const result: ChatTurn = { id: this.localId(), text: null, status: 'done' };
      this.turns.update(ts => [...ts, result]);
      this.receive(result.id, res);
    } catch (e) {
      this.patch(turn.id, { confirmError: extractApiError(e, this.t('ai.confirmError')) });
    } finally {
      this.patch(turn.id, { confirming: undefined });
    }
    this.scrollToEnd();
  }

  private receive(turnId: string, res: ChatResponse): void {
    const created = Date.parse(res.actions?.[0]?.createdAt ?? '');
    if (Number.isFinite(created)) this.skew = Date.now() - created;
    this.patch(turnId, { response: res, actions: (res.actions ?? []).map(a => this.track(a)), undone: (res.undone ?? []).map(a => this.track(a)) });
    // Una corrección deshizo algo de un mensaje anterior: ahí también se ve deshecho.
    for (const u of res.undone ?? []) if (u.actionId) this.markUndone(u.actionId, u.undoneAt ?? new Date().toISOString(), turnId);
    if (res.actions?.length || res.undone?.length) this.aiRefresh.notify();
    // Una receta, sea cual sea el status (puede venir junto con operaciones registradas): se abre su vista previa.
    if (res.catalogImport) this.openRecipe(turnId);
  }

  /** La vista previa y la confirmación son las del import de Excel: el chat solo arma las filas. */
  openRecipe(turnId: string): void {
    const r = this.turns().find(t => t.id === turnId)?.response;
    if (!r?.catalogImport || !this.importer) return;
    this.recipeTurnId.set(turnId);
    void this.importer.previewChatRecipe(r.catalogImport, r.replaceRecipeMenuItemIds ?? [], r.replacePreparationProductIds ?? []);
  }

  recipeImported(): void {
    const id = this.recipeTurnId();
    if (id !== null) this.patch(id, { recipeSaved: true });
    this.aiRefresh.notify();
  }

  /** Hasta undoableUntil en el reloj del back, corrido a este. Al vencer, un timer mueve `now` y el botón se apaga solo. */
  private track(action: ChatActionResponse): ChatAction {
    const until = Date.parse(action.undoableUntil ?? '');
    const deadline = Number.isFinite(until) ? until + this.skew : 0;
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

  private localId(): string {
    return `local-${this.nextId++}`;
  }

  private patch(id: string, changes: Partial<ChatTurn>): void {
    this.turns.update(ts => ts.map(t => t.id === id ? { ...t, ...changes } : t));
  }

  private patchAction(turnId: string, actionId: string, changes: Partial<ChatAction>): void {
    this.turns.update(ts => ts.map(t => t.id !== turnId ? t
      : { ...t, actions: t.actions?.map(a => a.actionId === actionId ? { ...a, ...changes } : a) }));
  }

  private markUndone(actionId: string, undoneAt: string, exceptTurnId: string): void {
    this.turns.update(ts => ts.map(t => t.id === exceptTurnId || !t.actions?.some(a => a.actionId === actionId) ? t
      : { ...t, actions: t.actions.map(a => a.actionId === actionId ? { ...a, undoneAt } : a) }));
  }

  /** Después de dibujar: con eventCoalescing la vista nueva recién está en el frame siguiente. */
  private scrollToEnd(): void {
    afterNextRender(() => this.end?.nativeElement.scrollIntoView({ block: 'end' }), { injector: this.injector });
  }

  statusIcon(status?: string): string {
    return STATUS_ICON[status ?? ''] ?? 'ti-info-circle';
  }

  /** Con dos lecturas del precio, el precio lo dice cada botón: en la lista iría el de una sola. */
  itemLine(type: string | undefined, it: ChatOperationItem, withPrice = true): string {
    const item = [formatNum(it.quantity), it.unitName, it.name].filter(Boolean).join(' ');
    return withPrice && type === 'PURCHASE' && it.pricePerUnit != null
      ? this.t('ai.itemPrice', { item, price: formatARS(it.pricePerUnit), unit: it.unitName ?? '' })
      : item;
  }

  fillExample(key: string): void {
    this.message = this.t(`ai.examples.${key}`);
    this.box?.nativeElement.focus();
  }

  close(): void {
    this.recipeTurnId.set(null);
    this.freshConversation.set(false);
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
