import { Component, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { extractApiError } from '../../core/utils/api-error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Con estos el link ya no sirve: en vez del formulario se ofrece pedir otro. */
const DEAD_LINK = ['INVALID_TOKEN', 'TOKEN_EXPIRED', 'TOKEN_ALREADY_USED'];
const MIN_PASSWORD = 8; // el backend exige 8, como el registro

/** /reset-password (olvidé mi contraseña) y /set-password (invitación): mismo pedido, cambia el texto (data.mode). */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './login.component.scss'
})
export class ResetPasswordComponent implements OnInit {
  readonly minPassword = MIN_PASSWORD;
  mode: 'reset' | 'set';
  private token: string | null = null;

  password = signal('');
  confirm = signal('');
  submitted = signal(false);
  saving = signal(false);
  saved = signal(false);
  error = signal<string | null>(null);
  /** El link no sirve (falta el token, no es un UUID o el back lo rechazó): sin formulario. */
  deadLink = signal<string | null>(null);

  tooShort = computed(() => this.password().length < MIN_PASSWORD);
  mismatch = computed(() => this.confirm() !== this.password());

  constructor(private route: ActivatedRoute, private router: Router, private auth: AuthService, private i18n: I18nService) {
    this.mode = route.snapshot.data['mode'] === 'set' ? 'set' : 'reset';
  }

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token && UUID.test(token)) this.token = token;
    else this.deadLink.set(this.t('resetPassword.invalidLink'));
    // El token no queda en el historial ni viaja en un Referer.
    if (token !== null) void this.router.navigate([], { relativeTo: this.route, replaceUrl: true });
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    if (!this.token || this.saving() || this.tooShort() || this.mismatch()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.auth.resetPassword({ token: this.token, newPassword: this.password() });
      this.saved.set(true);
    } catch (e) {
      const message = extractApiError(e, this.t('resetPassword.saveError'));
      DEAD_LINK.includes((e as any)?.error?.errorCode) ? this.deadLink.set(message) : this.error.set(message);
    } finally {
      this.saving.set(false);
    }
  }
}
