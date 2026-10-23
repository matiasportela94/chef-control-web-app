import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../../api/api';
import { getAccount } from '../../api/fn/account-controller/get-account';
import { deleteAccount } from '../../api/fn/account-controller/delete-account';
import { getSubscription } from '../../api/fn/subscription-controller/get-subscription';
import { listSubscriptionPlans } from '../../api/fn/subscription-controller/list-subscription-plans';
import { cancelSubscription } from '../../api/fn/subscription-controller/cancel-subscription';
import { AccountResponse } from '../../api/models/account-response';
import { SubscriptionResponse } from '../../api/models/subscription-response';
import { SubscriptionPlanResponse } from '../../api/models/subscription-plan-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { extractApiError } from '../../core/utils/api-error';
import { formatDatetime } from '../../core/utils/format';
import {
  BillingPeriod, PlanTier, UPCOMING_FEATURES, annualSavingPct, checkoutStarted, clearCheckoutMark, goToCheckout, planPrice
} from '../../core/utils/plans';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ActionDialogComponent } from '../../shared/components/action-dialog/action-dialog.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';

const CONFIRM_POLL_MS = 3000;
const CONFIRM_MAX_POLLS = 20;

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

  period         = signal<BillingPeriod>('MONTHLY');
  subscribing    = signal<string | null>(null);
  subscribeError = signal<string | null>(null);

  confirmState = signal<'idle' | 'waiting' | 'done' | 'timeout'>('idle');
  private pollTimer?: ReturnType<typeof setTimeout>;

  cancelling    = signal(false);
  cancelLoading = signal(false);
  cancelError   = signal<string | null>(null);

  deleting      = signal(false);
  deleteConfirm = signal('');
  deleteLoading = signal(false);
  deleteError   = signal<string | null>(null);

  deleteBlocked = computed(() =>
    this.deleteLoading() || this.deleteConfirm().trim() !== (this.account()?.name ?? ''));

  /**
   * Solo el dueño puede contratar, cancelar o cerrar la cuenta — y el backend lo vuelve a exigir, esto es
   * únicamente para no mostrar botones que van a rebotar. Se compara por email porque el nombre del rol
   * es texto libre de cada cuenta y no sirve para identificar al dueño.
   */
  isOwner = computed(() =>
    !!this.account()?.ownerEmail && this.account()!.ownerEmail === this.auth.currentUser()?.email);

  status = computed(() => this.subscription()?.status ?? null);

  /** Con una suscripción ACTIVE el backend rechaza otra (409): cambiar de plan es cancelar y volver a suscribirse. */
  canSubscribe = computed(() => this.isOwner() && this.status() !== 'ACTIVE');

  /** Cancelable: la que todavía cobra o va a cobrar. */
  canCancel = computed(() => this.isOwner() && (this.status() === 'ACTIVE' || this.status() === 'PAST_DUE'));

  annualSavingPct = computed(() => annualSavingPct(this.plans()));

  constructor(private api: Api, private auth: AuthService, private router: Router, private i18n: I18nService) {}

  async ngOnInit(): Promise<void> {
    await this.load();
    if (checkoutStarted()) {
      if (this.status() === 'PENDING') this.pollConfirmation(0);
      else clearCheckoutMark();
    }
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
      this.subscription.set(await this.parseOptional<SubscriptionResponse>(subscription));
      this.plans.set(await parseBlob<SubscriptionPlanResponse[]>(plans));
    } catch {
      this.error.set(this.t('plan.loadError'));
    } finally {
      this.loading.set(false);
    }
  }

  /** GET /subscription responde 204 sin cuerpo si la cuenta nunca se suscribió. */
  private async parseOptional<T>(raw: unknown): Promise<T | null> {
    if (raw == null || (raw instanceof Blob && raw.size === 0)) return null;
    return parseBlob<T>(raw);
  }

  // ---- contratar

  async subscribe(planTier: PlanTier): Promise<void> {
    this.subscribing.set(planTier);
    this.subscribeError.set(null);
    try {
      await goToCheckout(this.api, planTier, this.period());
      // subscribing queda en el plan elegido mientras el navegador se va a Mercado Pago.
    } catch (e: any) {
      this.subscribeError.set(extractApiError(e, this.t('plan.subscribeError')));
      this.subscribing.set(null);
    }
  }

  private pollConfirmation(attempt: number): void {
    this.confirmState.set('waiting');
    this.pollTimer = setTimeout(async () => {
      try {
        const raw = await this.api.invoke(getSubscription);
        this.subscription.set(await this.parseOptional<SubscriptionResponse>(raw));
      } catch { /* un error suelto no corta la espera: se reintenta */ }
      if (this.status() !== 'PENDING') {
        clearCheckoutMark();
        this.confirmState.set(this.status() === 'ACTIVE' ? 'done' : 'idle');
        await this.load();
      } else if (attempt + 1 >= CONFIRM_MAX_POLLS) {
        clearCheckoutMark();
        this.confirmState.set('timeout');
      } else {
        this.pollConfirmation(attempt + 1);
      }
    }, CONFIRM_POLL_MS);
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

  /** En mora no hay período pagado que conservar: cancelar baja a prueba en el acto. */
  get cancelMessage(): string {
    const s = this.subscription();
    if (!s || s.status === 'PAST_DUE' || !s.currentPeriodEnd) return this.t('plan.cancelMessageNow');
    return this.t('plan.cancelMessage', { plan: this.tierName(s.planTier), date: this.dateTime(s.currentPeriodEnd) });
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
