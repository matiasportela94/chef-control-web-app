import { Component, HostListener, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../../api/api';
import { getAccount } from '../../api/fn/account-controller/get-account';
import { deleteAccount } from '../../api/fn/account-controller/delete-account';
import { renameAccount } from '../../api/fn/account-controller/rename-account';
import { getSubscription } from '../../api/fn/subscription-controller/get-subscription';
import { listSubscriptionPlans } from '../../api/fn/subscription-controller/list-subscription-plans';
import { cancelSubscription } from '../../api/fn/subscription-controller/cancel-subscription';
import { previewSubscriptionChange } from '../../api/fn/subscription-controller/preview-subscription-change';
import { cancelSubscriptionChange } from '../../api/fn/subscription-controller/cancel-subscription-change';
import { AccountResponse } from '../../api/models/account-response';
import { SubscriptionResponse } from '../../api/models/subscription-response';
import { SubscriptionPlanResponse } from '../../api/models/subscription-plan-response';
import { SubscriptionChangePreviewResponse } from '../../api/models/subscription-change-preview-response';
import { PendingSubscriptionChangeResponse } from '../../api/models/pending-subscription-change-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { extractApiError } from '../../core/utils/api-error';
import { formatDatetime } from '../../core/utils/format';
import {
  BillingPeriod, CheckoutMark, PlanTier, UPCOMING_FEATURES, annualSavingPct, checkoutMark, clearCheckoutMark, goToCheckout,
  planPrice, requestPlanChange
} from '../../core/utils/plans';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { ActionDialogComponent } from '../../shared/components/action-dialog/action-dialog.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';

const CONFIRM_POLL_MS = 3000;
const CONFIRM_MAX_POLLS = 20;

/** Qué hace elegir un plan en un período, contra la suscripción ACTIVE. Solo decide la etiqueta del botón: el tipo real lo dice el back. */
type CardAction = 'current' | 'upgrade' | 'downgrade' | 'period' | 'upgradeAndPeriod';

@Component({
  selector: 'app-plan',
  standalone: true,
  imports: [SpinnerComponent, ActionDialogComponent],
  templateUrl: './plan.component.html',
  styleUrl: './plan.component.scss'
})
export class PlanComponent implements OnInit, OnDestroy {
  account      = signal<AccountResponse | null>(null);
  subscription = signal<SubscriptionResponse | null>(null);
  plans        = signal<SubscriptionPlanResponse[]>([]);
  /** El endpoint trae también TRIAL (sin precio, para la landing): acá solo se listan los que se contratan. */
  paidPlans    = computed(() => this.plans().filter(p => p.monthlyAmountArs != null));
  loading = signal(true);
  error   = signal<string | null>(null);

  /** El modal de planes. La vista previa de un cambio (action-dialog) se abre encima, con z-index mayor. */
  plansOpen      = signal(false);
  period         = signal<BillingPeriod>('MONTHLY');
  subscribing    = signal<string | null>(null);
  subscribeError = signal<string | null>(null);

  /** 'dropped': se volvió de Mercado Pago pero el cambio ya no está (se reemplazó, se canceló o venció sin autorizar). */
  confirmState = signal<'idle' | 'waiting' | 'done' | 'timeout' | 'dropped'>('idle');
  /** Qué se está confirmando a la vuelta de Mercado Pago: una suscripción nueva, una suba o un cambio programado. */
  confirmKind = signal<CheckoutMark['kind']>('subscribe');
  private pollTimer?: ReturnType<typeof setTimeout>;

  /** La vista previa del cambio elegido: con valor, el diálogo de confirmación está abierto. */
  preview        = signal<SubscriptionChangePreviewResponse | null>(null);
  previewLoading = signal<string | null>(null);
  changeLoading  = signal(false);
  changeError    = signal<string | null>(null);
  /** Cancelar o completar el cambio programado. */
  pendingBusy    = signal(false);
  pendingError   = signal<string | null>(null);

  cancelling    = signal(false);
  cancelLoading = signal(false);
  cancelError   = signal<string | null>(null);

  /** Nombre de la cuenta: es el encabezado del selector de locales de quien trabaja en más de una. */
  accountName   = signal('');
  renaming      = signal(false);
  renameError   = signal<string | null>(null);
  canRename = computed(() => !this.renaming() && !!this.accountName().trim()
    && this.accountName().trim() !== (this.account()?.name ?? ''));

  deleting      = signal(false);
  deleteConfirm = signal('');
  deleteLoading = signal(false);
  deleteError   = signal<string | null>(null);

  deleteBlocked = computed(() =>
    this.deleteLoading() || this.deleteConfirm().trim() !== (this.account()?.name ?? ''));

  /**
   * Solo el dueño puede contratar, cambiar, cancelar o cerrar la cuenta — y el backend lo vuelve a exigir, esto es
   * únicamente para no mostrar botones que van a rebotar. Se compara por email porque el nombre del rol
   * es texto libre de cada cuenta y no sirve para identificar al dueño.
   */
  isOwner = computed(() =>
    !!this.account()?.ownerEmail && this.account()!.ownerEmail === this.auth.currentUser()?.email);

  status = computed(() => this.subscription()?.status ?? null);

  /**
   * Con una suscripción ACTIVE o PAST_DUE las cards del modal cambian de plan (en mora, deshabilitadas: primero se paga).
   * Sin una vigente (ninguna, PENDING o CANCELLED aunque conserve el plan) se contrata: el back no cambia el plan de una
   * suscripción que no está ACTIVE.
   */
  hasPlanToChange = computed(() => this.status() === 'ACTIVE' || this.status() === 'PAST_DUE');

  /** El cambio programado. Con `effectiveAt` vencido ya se está cobrando: no se cancela ni se reemplaza. */
  pending = computed(() => this.subscription()?.pendingChange ?? null);

  /** Cancelable: la que todavía cobra o va a cobrar. */
  canCancel = computed(() => this.isOwner() && (this.status() === 'ACTIVE' || this.status() === 'PAST_DUE'));

  annualSavingPct = computed(() => annualSavingPct(this.plans()));

  constructor(private api: Api, private auth: AuthService, private router: Router, private i18n: I18nService,
              private toast: ToastService) {}

  async ngOnInit(): Promise<void> {
    await this.load();
    const mark = checkoutMark();
    if (!mark) return;
    const result = this.checkoutResult(mark);
    if (result === 'waiting') this.pollConfirmation(0, mark);
    else clearCheckoutMark();
    if (result === 'dropped') this.showResult(mark.kind, 'dropped');
  }

  ngOnDestroy(): void {
    clearTimeout(this.pollTimer);
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  async load(): Promise<void> {
    if (!this.account()) this.loading.set(true);
    this.error.set(null);
    try {
      const [account, subscription, plans] = await Promise.all([
        this.api.invoke(getAccount),
        this.api.invoke(getSubscription),
        this.api.invoke(listSubscriptionPlans),
      ]) as unknown[];
      this.account.set(await parseBlob<AccountResponse>(account));
      this.accountName.set(this.account()?.name ?? '');
      this.subscription.set(await this.parseOptional<SubscriptionResponse>(subscription));
      this.plans.set(await parseBlob<SubscriptionPlanResponse[]>(plans));
    } catch {
      this.error.set(this.t('plan.loadError'));
    } finally {
      this.loading.set(false);
    }
  }

  async saveAccountName(): Promise<void> {
    if (!this.canRename()) return;
    this.renaming.set(true);
    this.renameError.set(null);
    try {
      const a = await parseBlob<AccountResponse>(await this.api.invoke(renameAccount, { body: { name: this.accountName().trim() } }) as unknown);
      this.account.update(cur => ({ ...cur, ...a }));
      this.accountName.set(a.name ?? '');
      this.toast.success(this.t('plan.accountNameSaved'));
      await this.auth.refreshSession().catch(() => {});  // el selector agrupa por el nombre de la cuenta
    } catch (e) {
      this.renameError.set(extractApiError(e, this.t('plan.accountNameError')));
    } finally {
      this.renaming.set(false);
    }
  }

  /** GET /subscription responde 204 sin cuerpo si la cuenta nunca se suscribió. */
  private async parseOptional<T>(raw: unknown): Promise<T | null> {
    if (raw == null || (raw instanceof Blob && raw.size === 0)) return null;
    return parseBlob<T>(raw);
  }

  // ---- modal de planes

  openPlans(): void {
    // Arranca en el período que se paga, para que se vea cuál es el plan actual.
    const bp = this.subscription()?.billingPeriod;
    if (bp === 'MONTHLY' || bp === 'ANNUAL') this.period.set(bp);
    this.subscribeError.set(null);
    this.changeError.set(null);
    this.plansOpen.set(true);
  }

  closePlans(): void {
    this.plansOpen.set(false);
  }

  /**
   * Con la vista previa abierta, Escape la cierra a ella (lo maneja action-dialog) y el modal queda. Este listener
   * corre antes que el del diálogo porque el host de este componente se crea antes que sus hijos.
   */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.plansOpen() && !this.preview()) this.closePlans();
  }

  // ---- contratar

  async subscribe(planTier: PlanTier, period: BillingPeriod = this.period()): Promise<void> {
    this.subscribing.set(planTier);
    this.subscribeError.set(null);
    try {
      await goToCheckout(this.api, planTier, period);
      // subscribing queda en el plan elegido mientras el navegador se va a Mercado Pago.
    } catch (e: any) {
      this.subscribeError.set(extractApiError(e, this.t('plan.subscribeError')));
      this.subscribing.set(null);
    }
  }

  /** En mora: el POST /subscription reemplaza a la PAST_DUE. Mismo plan y período, otra tarjeta. */
  payWithOtherCard(s: SubscriptionResponse): void {
    this.subscribe(s.planTier as PlanTier, s.billingPeriod as BillingPeriod);
  }

  // ---- vuelta de Mercado Pago

  /**
   * Si ya se ve lo que se fue a hacer a Mercado Pago. Un cambio de período que ya no está (o que es otro) no se
   * autorizó: lo descartó un reemplazo, una cancelación o el fin del período. No es un éxito.
   */
  private checkoutResult(mark: CheckoutMark): 'confirmed' | 'waiting' | 'dropped' {
    if (mark.kind === 'subscribe') return this.status() !== 'PENDING' ? 'confirmed' : 'waiting';
    if (mark.kind === 'upgrade') return this.subscription()?.planTier === mark.planTier ? 'confirmed' : 'waiting';
    const pc = this.pending();
    if (pc?.planTier !== mark.planTier || pc?.billingPeriod !== mark.billingPeriod) return 'dropped';
    return pc.awaitingCheckout ? 'waiting' : 'confirmed';
  }

  private pollConfirmation(attempt: number, mark: CheckoutMark): void {
    this.showResult(mark.kind, 'waiting');
    this.pollTimer = setTimeout(async () => {
      try {
        const raw = await this.api.invoke(getSubscription);
        this.subscription.set(await this.parseOptional<SubscriptionResponse>(raw));
      } catch { /* un error suelto no corta la espera: se reintenta */ }
      const result = this.checkoutResult(mark);
      if (result === 'confirmed') {
        clearCheckoutMark();
        await this.afterConfirmed(mark.kind);
      } else if (result === 'dropped') {
        clearCheckoutMark();
        this.showResult(mark.kind, 'dropped');
      } else if (attempt + 1 >= CONFIRM_MAX_POLLS) {
        clearCheckoutMark();
        this.showResult(mark.kind, 'timeout');
      } else {
        this.pollConfirmation(attempt + 1, mark);
      }
    }, CONFIRM_POLL_MS);
  }

  private showResult(kind: CheckoutMark['kind'], state: 'waiting' | 'done' | 'timeout' | 'dropped'): void {
    this.confirmKind.set(kind);
    this.confirmState.set(state);
  }

  private async afterConfirmed(kind: CheckoutMark['kind']): Promise<void> {
    if (kind === 'subscribe' && this.status() !== 'ACTIVE') {
      this.confirmState.set('idle');
    } else {
      this.showResult(kind, 'done');
      // El plan nuevo viaja en la sesión (features): sin renovarla, el resto de la app seguiría viendo el viejo.
      // Un cambio programado no toca el plan hasta el fin del período: no hay sesión que renovar.
      if (kind !== 'change') await this.auth.refreshSession().catch(() => {});
    }
    await this.load();
  }

  // ---- cambiar de plan

  /** "Más alto" = más caro por mes, con los precios del back: el orden de los planes no se escribe en el front. */
  private monthlyPrice(tier?: string): number {
    return this.plans().find(p => p.planTier === tier)?.monthlyAmountArs ?? 0;
  }

  cardAction(tier?: string): CardAction {
    const s = this.subscription();
    const samePeriod = s?.billingPeriod === this.period();
    if (s?.planTier === tier) return samePeriod ? 'current' : 'period';
    if (this.monthlyPrice(tier) < this.monthlyPrice(s?.planTier)) return 'downgrade';
    // Suba + cambio de período a la vez: el back lo rechaza, son dos pasos.
    return samePeriod ? 'upgrade' : 'upgradeAndPeriod';
  }

  /**
   * La card que se resalta. Sin suscripción vigente no hay período que comparar: es el plan efectivo de la cuenta en
   * cualquier posición del selector (puesto a mano, o uno cancelado que sigue hasta `planExpiresAt`).
   */
  isCurrentCard(tier?: string): boolean {
    return this.hasPlanToChange() ? this.cardAction(tier) === 'current' : this.account()?.plan === tier;
  }

  isPendingChoice(tier?: string): boolean {
    const pc = this.pending();
    return pc?.planTier === tier && pc?.billingPeriod === this.period();
  }

  /** Ya llegó su fecha: se está cobrando (hasta una hora). El back no lo deja cancelar ni reemplazar. */
  isApplying(pc: PendingSubscriptionChangeResponse): boolean {
    return !!pc.effectiveAt && new Date(pc.effectiveAt).getTime() <= Date.now();
  }

  async openPlanChange(planTier: PlanTier): Promise<void> {
    this.previewLoading.set(planTier);
    this.changeError.set(null);
    try {
      const raw = await this.api.invoke(previewSubscriptionChange, { planTier, billingPeriod: this.period() });
      this.preview.set(await parseBlob<SubscriptionChangePreviewResponse>(raw));
    } catch (e: any) {
      this.changeError.set(extractApiError(e, this.t('plan.change.previewError')));
    } finally {
      this.previewLoading.set(null);
    }
  }

  closePreview(): void {
    this.preview.set(null);
    this.changeError.set(null);
  }

  async confirmPlanChange(): Promise<void> {
    const p = this.preview();
    if (!p) return;
    this.changeLoading.set(true);
    this.changeError.set(null);
    try {
      const res = await requestPlanChange(this.api, p.planTier as PlanTier, p.billingPeriod as BillingPeriod);
      // Con checkout, el navegador se va a Mercado Pago: changeLoading queda prendido mientras sale.
      if (res.checkoutUrl) return;
      this.preview.set(null);
      this.plansOpen.set(false);
      await this.afterConfirmed('change');
    } catch (e: any) {
      this.changeError.set(extractApiError(e, this.t('plan.change.error')));
    }
    this.changeLoading.set(false);
  }

  get previewTitle(): string {
    const p = this.preview();
    return p ? this.t('plan.change.previewTitle', { plan: this.tierName(p.planTier), period: this.periodName(p.billingPeriod) }) : '';
  }

  get previewMessage(): string {
    const p = this.preview();
    const s = this.subscription();
    if (!p || !s) return '';
    const amount = this.price(p.newAmountArs) + this.perPeriod(p.billingPeriod);
    if (p.changeType === 'UPGRADE') {
      return [
        this.t('plan.change.previewUpgrade', {
          charge: this.price(p.chargeNowArs ?? undefined), days: p.daysRemaining ?? 0, periodDays: p.periodDays ?? 0,
          date: this.formatDate(p.nextChargeAt), amount,
        }),
        p.replacesPendingChange ? this.t('plan.change.upgradeDiscardsPending') : '',
      ].filter(Boolean).join(' ');
    }
    return [
      this.t('plan.change.previewScheduled', {
        date: this.formatDate(p.effectiveAt), plan: this.tierName(p.planTier), period: this.periodName(p.billingPeriod),
        amount, current: this.tierName(s.planTier),
      }),
      this.t(p.requiresCheckout ? 'plan.change.previewNeedsCheckout' : 'plan.change.previewNoCharge'),
      p.replacesPendingChange ? this.t('plan.change.replacesPending') : '',
      // Mati, 2026-11-16: el aviso va en lo que se cobra más adelante, no en la suba (se paga en el momento).
      this.t('plan.change.priceMayChange'),
    ].filter(Boolean).join(' ');
  }

  get previewConfirmLabel(): string {
    const p = this.preview();
    if (p?.changeType === 'UPGRADE') return this.t('plan.change.payNow', { charge: this.price(p.chargeNowArs ?? undefined) });
    return this.t(p?.requiresCheckout ? 'plan.change.goToCheckout' : 'plan.change.schedule');
  }

  async cancelPendingChange(): Promise<void> {
    this.pendingBusy.set(true);
    this.pendingError.set(null);
    try {
      await this.api.invoke(cancelSubscriptionChange);
      this.confirmState.set('idle');
      await this.load();
    } catch (e: any) {
      this.pendingError.set(extractApiError(e, this.t('plan.change.cancelPendingError')));
    } finally {
      this.pendingBusy.set(false);
    }
  }

  /** Cambio de período con el checkout sin terminar: pedir lo mismo otra vez devuelve otro checkoutUrl. */
  async completePendingChange(pc: PendingSubscriptionChangeResponse): Promise<void> {
    this.pendingBusy.set(true);
    this.pendingError.set(null);
    try {
      if ((await requestPlanChange(this.api, pc.planTier as PlanTier, pc.billingPeriod as BillingPeriod)).checkoutUrl) return;
      await this.load();
    } catch (e: any) {
      this.pendingError.set(extractApiError(e, this.t('plan.change.error')));
    }
    this.pendingBusy.set(false);
  }

  // ---- cancelar

  openCancel(): void {
    this.cancelling.set(true);
    this.cancelError.set(null);
  }

  async confirmCancel(): Promise<void> {
    this.cancelLoading.set(true);
    this.cancelError.set(null);
    try {
      await this.api.invoke(cancelSubscription);
      this.cancelling.set(false);
      await this.load();
    } catch (e: any) {
      this.cancelError.set(extractApiError(e, this.t('plan.cancelError')));
    } finally {
      this.cancelLoading.set(false);
    }
  }

  /** En mora no hay período pagado que conservar: cancelar baja a prueba en el acto. Cancelar descarta el cambio programado. */
  get cancelMessage(): string {
    const s = this.subscription();
    const msg = !s || s.status === 'PAST_DUE' || !s.currentPeriodEnd
      ? this.t('plan.cancelMessageNow')
      : this.t('plan.cancelMessage', { plan: this.tierName(s.planTier), date: this.dateTime(s.currentPeriodEnd) });
    return this.pending() ? msg + ' ' + this.t('plan.change.cancelDiscardsPending') : msg;
  }

  // ---- cerrar la cuenta

  openDelete(): void {
    this.deleting.set(true);
    this.deleteConfirm.set('');
    this.deleteError.set(null);
  }

  closeDelete(): void {
    this.deleting.set(false);
    this.deleteConfirm.set('');
  }

  async confirmDelete(): Promise<void> {
    if (this.deleteBlocked()) return;
    this.deleteLoading.set(true);
    this.deleteError.set(null);
    try {
      await this.api.invoke(deleteAccount);
      await this.auth.logout();
      await this.router.navigate(['/']);
    } catch (e: any) {
      this.deleteError.set(extractApiError(e, this.t('plan.deleteError')));
    } finally {
      this.deleteLoading.set(false);
    }
  }

  // ---- formato

  tierName(tier?: string): string {
    return tier ? this.t('plan.tiers.' + tier) : '—';
  }

  periodName(period?: string): string {
    return period ? this.t('plan.periods.' + period) : '';
  }

  perPeriod(period?: string): string {
    return this.t(period === 'ANNUAL' ? 'plan.perYear' : 'plan.perMonth');
  }

  featureLabel(key: string): string {
    const label = this.t('plan.features.' + key);
    return label.startsWith('plan.') ? key : label;
  }

  isUpcoming(key: string): boolean {
    return UPCOMING_FEATURES.has(key);
  }

  price(n?: number): string {
    return planPrice(n);
  }

  dateTime(iso?: string): string {
    return formatDatetime(iso);
  }

  get restaurantUsage(): string {
    const a = this.account();
    if (!a) return '';
    const used = a.restaurantCount ?? 0;
    return a.restaurantLimit == null
      ? this.t('plan.restaurantUsageUnlimited', { used })
      : this.t('plan.restaurantUsage', { used, limit: a.restaurantLimit });
  }

  formatDate(iso?: string): string {
    return iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
  }
}
