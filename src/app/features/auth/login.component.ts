import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { RestaurantSummary } from '../../api/models/restaurant-summary';

export type AuthView = 'login' | 'register' | 'forgot' | 'restaurant-select';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  view = signal<AuthView>('login');
  loading = signal(false);
  errorMsg = signal<string | null>(null);
  forgotSent = signal(false);
  restaurants = signal<RestaurantSummary[]>([]);

  loginForm: FormGroup;
  registerForm: FormGroup;
  forgotForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.loginForm = this.fb.group({
      email:    ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.registerForm = this.fb.group({
      restaurantName: ['', Validators.required],
      ownerName:      ['', Validators.required],
      ownerEmail:     ['', [Validators.required, Validators.email]],
      ownerPassword:  ['', [Validators.required, Validators.minLength(6)]],
      ownerPhone:     ['']
    });

    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  ngOnInit(): void {
    const view = this.route.snapshot.queryParamMap.get('view') as AuthView | null;
    if (view === 'register' || view === 'forgot') this.view.set(view);
  }

  setView(v: AuthView): void {
    this.errorMsg.set(null);
    this.forgotSent.set(false);
    this.view.set(v);
  }

  async submitLogin(): Promise<void> {
    if (this.loginForm.invalid) { this.loginForm.markAllAsTouched(); return; }
    this.loading.set(true);
    try {
      const response = await this.authService.login(this.loginForm.getRawValue());
      const list = response.restaurants ?? [];
      if (list.length > 1) {
        this.restaurants.set(list);
        this.view.set('restaurant-select');
      } else {
        this.router.navigate(['/dashboard']);
      }
    } catch (e: any) {
      const msg = e?.error?.message ?? 'Email o contraseña incorrectos';
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
      await this.authService.register(this.registerForm.getRawValue());
      this.router.navigate(['/dashboard']);
    } catch (e: any) {
      this.errorMsg.set(e?.error?.message ?? 'Error al crear la cuenta');
    } finally {
      this.loading.set(false);
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
      this.errorMsg.set(e?.error?.message ?? 'Error al enviar el correo');
    } finally {
      this.loading.set(false);
    }
  }

  async selectRestaurant(r: RestaurantSummary): Promise<void> {
    if (!r.id || this.loading()) return;
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      await this.authService.switchToRestaurant(r.id);
      this.router.navigate(['/dashboard']);
    } catch (e: any) {
      this.errorMsg.set(e?.error?.message ?? 'Error al conectar con el restaurante');
    } finally {
      this.loading.set(false);
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
