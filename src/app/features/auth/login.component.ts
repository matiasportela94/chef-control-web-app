import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { groupByAccount } from '../../core/utils/restaurants';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { Api } from '../../api/api';
import { extractApiError } from '../../core/utils/api-error';
import { BillingPeriod, PlanTier, goToCheckout } from '../../core/utils/plans';
import { RestaurantSummary } from '../../api/models/restaurant-summary';
import { LoginResponse } from '../../api/models/login-response';
import { decodeJwtPayload } from '../../core/utils/jwt';
import { GoogleButtonComponent } from '../../shared/components/google-button/google-button.component';
import { environment } from '../../../environments/environment';
import { safeReturnUrl } from '../../core/guards/auth.guard';

const PAID_TIERS: readonly string[] = ['STARTER', 'PRO', 'ENTERPRISE'];
const PHRASE_MS = 1500;

export type AuthView = 'login' | 'register' | 'forgot' | 'restaurant-select';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, GoogleButtonComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit, OnDestroy {
  view = signal<AuthView>('login');
  loading = signal(false);
  errorMsg = signal<string | null>(null);
  forgotSent = signal(false);
  restaurants = signal<RestaurantSummary[]>([]);
  /** El local que se está abriendo: con el back dormido tarda, y sin aviso parecía colgado. */
  switchingId = signal<string | null>(null);
  switchPhrase = signal('');
  private phraseTimer?: ReturnType<typeof setInterval>;
  /** Se fue del login antes de la respuesta: no se lo saca de donde esté. */
  private destroyed = false;
  /** Adónde iba antes de que el authGuard lo mandara acá. */
  private returnUrl = '/dashboard';
  /** Agrupados por cuenta, como el selector de la barra: encabezado solo si hay más de una. */
  restaurantGroups = computed(() => groupByAccount(this.restaurants()));
  /** Plan elegido en la landing: después de crear la cuenta se va derecho al checkout. */
  chosenPlan = signal<{ tier: PlanTier; period: BillingPeriod } | null>(null);

  readonly googleEnabled = !!environment.googleClientId;
  /** Token de Google de alguien sin cuenta: el alta solo le pide el nombre del restaurante. */
  googleToken = signal<string | null>(null);
  googleEmail = signal<string | null>(null);

  loginForm: FormGroup;
  registerForm: FormGroup;
  forgotForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private api: Api,
    private i18n: I18nService,
    private toast: ToastService
  ) {
    this.loginForm = this.fb.group({
      email:    ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.registerForm = this.fb.group({
      restaurantName: ['', Validators.required],
      ownerName:      ['', Validators.required],
      ownerEmail:     ['', [Validators.required, Validators.email]],
      ownerPassword:  ['', [Validators.required, Validators.minLength(8)]],  // el backend exige 8
      ownerPhone:     ['']
    });

    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.returnUrl = safeReturnUrl(params.get('returnUrl'));
    if (this.authService.isAuthenticated) { this.router.navigateByUrl(this.returnUrl); return; }
    const view = params.get('view') as AuthView | null;
    if (view === 'register' || view === 'forgot') this.view.set(view);
    const tier = params.get('plan');
    if (tier && PAID_TIERS.includes(tier)) {
      this.chosenPlan.set({ tier: tier as PlanTier, period: params.get('period') === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY' });
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    clearInterval(this.phraseTimer);
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  private goToReturnUrl(): void {
    if (!this.destroyed) this.router.navigateByUrl(this.returnUrl);
  }

  setView(v: AuthView): void {
    this.errorMsg.set(null);
    this.cancelGoogle();
    this.forgotSent.set(false);
    this.view.set(v);
  }

  async submitLogin(): Promise<void> {
    if (this.loginForm.invalid) { this.loginForm.markAllAsTouched(); return; }
    this.loading.set(true);
    try {
      const response = await this.authService.login(this.loginForm.getRawValue());
      await this.afterAuth(response);
    } catch (e: any) {
      const msg = extractApiError(e, this.t('auth.login.error'));
      const ctrl = this.loginForm.get('password')!;
      ctrl.setErrors({ serverError: msg });
      ctrl.valueChanges.pipe(take(1)).subscribe(() => {
        const errs = { ...ctrl.errors };
        delete errs['serverError'];
        ctrl.setErrors(Object.keys(errs).length ? errs : null);
      });
    } finally {
      this.loading.set(false);
    }
  }

  async submitRegister(): Promise<void> {
    if (this.registerForm.invalid) { this.registerForm.markAllAsTouched(); return; }
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      const response = await this.authService.register(this.registerForm.getRawValue());
      await this.afterAuth(response);
    } catch (e: any) {
      this.errorMsg.set(extractApiError(e, this.t('auth.register.error')));
      this.loading.set(false);
    }
  }

  /**
   * Botón de Google, en login o en registro. Si el usuario no existe y no hay nombre de restaurante cargado,
   * el backend responde GOOGLE_ACCOUNT_NOT_REGISTERED y se pasa al alta corta (solo el restaurante).
   */
  async onGoogleCredential(idToken: string): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    const restaurantName = this.view() === 'register' ? (this.registerForm.value.restaurantName ?? '').trim() : '';
    try {
      const response = await this.authService.googleSignIn({ idToken, restaurantName: restaurantName || undefined });
      await this.afterAuth(response);
    } catch (e: any) {
      if (e?.error?.errorCode === 'GOOGLE_ACCOUNT_NOT_REGISTERED') {
        this.view.set('register');
        this.googleToken.set(idToken);
        this.googleEmail.set(String(decodeJwtPayload(idToken)?.['email'] ?? ''));
      } else {
        this.cancelGoogle();  // un token vencido (dura 1 h) no sirve para reintentar: hay que volver a tocar el botón
        this.errorMsg.set(extractApiError(e, this.t('auth.google.error')));
      }
      this.loading.set(false);
    }
  }

  async submitGoogleRegister(): Promise<void> {
    const name = this.registerForm.get('restaurantName')!;
    if (name.invalid) { name.markAsTouched(); return; }
    await this.onGoogleCredential(this.googleToken()!);
  }

  cancelGoogle(): void {
    this.googleToken.set(null);
    this.googleEmail.set(null);
  }

  /**
   * Después de entrar o registrarse. Con un plan pago elegido en la landing va derecho al checkout: la cuenta
   * ya existe (si es nueva, en el plan gratis) pase lo que pase con el pago, y si el checkout no abre, /plan
   * permite reintentarlo. Sin plan: a elegir local si tiene varios, o al panel.
   */
  private async afterAuth(response: LoginResponse): Promise<void> {
    const plan = this.chosenPlan();
    if (!plan) {
      const list = response.restaurants ?? [];
      if (list.length > 1) {
        this.restaurants.set(list);
        this.view.set('restaurant-select');
        this.loading.set(false);
      } else {
        this.goToReturnUrl();
      }
      return;
    }
    try {
      await goToCheckout(this.api, plan.tier, plan.period);
    } catch (e: any) {
      this.toast.error(this.t('auth.register.checkoutError'), extractApiError(e, ''));
      this.router.navigate(['/plan']);
    }
  }

  async submitForgot(): Promise<void> {
    if (this.forgotForm.invalid) { this.forgotForm.markAllAsTouched(); return; }
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      await this.authService.forgotPassword(this.forgotForm.getRawValue());
      this.forgotSent.set(true);
    } catch (e: any) {
      this.errorMsg.set(extractApiError(e, 'Error al enviar el correo'));
    } finally {
      this.loading.set(false);
    }
  }

  async selectRestaurant(r: RestaurantSummary): Promise<void> {
    if (!r.id || this.switchingId()) return;
    this.switchingId.set(r.id);
    this.errorMsg.set(null);
    const phrases = this.i18n.list('auth.switchingPhrases');
    let i = 0;
    this.switchPhrase.set(phrases[0] ?? '');
    this.phraseTimer = setInterval(() => this.switchPhrase.set(phrases[i = (i + 1) % phrases.length]), PHRASE_MS);
    try {
      await this.authService.switchToRestaurant(r.id);
      this.goToReturnUrl();
    } catch (e: any) {
      this.errorMsg.set(extractApiError(e, this.t('auth.switchError')));
    } finally {
      clearInterval(this.phraseTimer);
      this.switchingId.set(null);
    }
  }

isInvalid(form: 'login' | 'register' | 'forgot', field: string): boolean {
    const map: Record<string, FormGroup> = {
      login:    this.loginForm,
      register: this.registerForm,
      forgot:   this.forgotForm
    };
    const ctrl = map[form].get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }
}
