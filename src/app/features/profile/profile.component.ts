import { Component, HostListener, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { extractApiError } from '../../core/utils/api-error';
import { GoogleButtonComponent } from '../../shared/components/google-button/google-button.component';

/** El mismo mínimo que exige el backend. */
const MIN_PASSWORD_LENGTH = 8;

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [GoogleButtonComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent {
  readonly user = computed(() => this.auth.currentUser());
  /** Sin client id (producción hoy) no hay botón de Google con qué vincular ni confirmar. */
  readonly googleEnabled = !!environment.googleClientId;

  linking   = signal(false);
  linkError = signal<string | null>(null);

  unlinkOpen     = signal(false);
  newPassword    = signal('');
  repeatPassword = signal('');
  unlinkLoading  = signal(false);
  unlinkError    = signal<string | null>(null);

  passwordOk = computed(() =>
    this.newPassword().length >= MIN_PASSWORD_LENGTH && this.newPassword() === this.repeatPassword());
  passwordProblem = computed(() => {
    const pwd = this.newPassword(), repeat = this.repeatPassword();
    if (pwd && pwd.length < MIN_PASSWORD_LENGTH) return this.t('profile.unlink.tooShort');
    if (repeat && repeat !== pwd) return this.t('profile.unlink.mismatch');
    return null;
  });

  constructor(private auth: AuthService, private i18n: I18nService, private toast: ToastService) {}

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  async link(idToken: string): Promise<void> {
    this.linking.set(true);
    this.linkError.set(null);
    try {
      await this.auth.linkGoogle(idToken);
      this.toast.success(this.t('profile.google.linkedToast'));
    } catch (e) {
      this.linkError.set(extractApiError(e, this.t('profile.google.linkError')));
    } finally {
      this.linking.set(false);
    }
  }

  openUnlink(): void {
    this.newPassword.set('');
    this.repeatPassword.set('');
    this.unlinkError.set(null);
    this.unlinkOpen.set(true);
  }

  @HostListener('document:keydown.escape')
  closeUnlink(): void {
    if (!this.unlinkLoading()) this.unlinkOpen.set(false);
  }

  /** El botón de Google del diálogo solo aparece con la contraseña válida: su token es la confirmación. */
  async unlink(idToken: string): Promise<void> {
    if (!this.passwordOk()) return;
    this.unlinkLoading.set(true);
    this.unlinkError.set(null);
    try {
      await this.auth.unlinkGoogle(idToken, this.newPassword());
      this.unlinkOpen.set(false);
      this.toast.success(this.t('profile.unlink.doneToast'), this.t('profile.unlink.doneHint'));
    } catch (e) {
      this.unlinkError.set(extractApiError(e, this.t('profile.unlink.error')));
    } finally {
      this.unlinkLoading.set(false);
    }
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
