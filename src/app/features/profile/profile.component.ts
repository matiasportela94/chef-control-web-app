import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
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
export class ProfileComponent implements OnInit {
  readonly user = computed(() => this.auth.currentUser());
  /** Sin client id (producción hoy) no hay botón de Google con qué vincular ni confirmar. */
  readonly googleEnabled = !!environment.googleClientId;

  // Nombre y teléfono: el teléfono no está en la sesión, así que hasta que responde el GET no se puede guardar
  // (guardar antes borraría el teléfono). Si el GET falla, queda bloqueado por lo mismo.
  loadingProfile = signal(true);
  loadError      = signal<string | null>(null);
  name           = signal('');
  phone          = signal('');
  private saved  = signal({ name: '', phone: '' });
  saving         = signal(false);
  saveError      = signal<string | null>(null);

  nameMissing = computed(() => !this.name().trim());
  canSave = computed(() => !this.loadingProfile() && !this.loadError() && !this.saving() && !this.nameMissing()
    && (this.name().trim() !== this.saved().name || this.phone().trim() !== this.saved().phone));

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

  constructor(private auth: AuthService, private i18n: I18nService, private toast: ToastService) {
    this.name.set(auth.currentUser()?.name ?? '');
  }

  async ngOnInit(): Promise<void> {
    try {
      this.fill(await this.auth.loadProfile());
    } catch {
      // Texto propio y no el del errorCode: tiene que decir por qué no se puede guardar.
      this.loadError.set(this.t('profile.loadError'));
    } finally {
      this.loadingProfile.set(false);
    }
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      // Teléfono vacío = sacarlo: se omite (null en el back), como en /users.
      this.fill(await this.auth.updateProfile({ name: this.name().trim(), phone: this.phone().trim() || undefined }));
      this.toast.success(this.t('profile.savedToast'));
    } catch (e) {
      this.saveError.set(extractApiError(e, this.t('profile.saveError')));
    } finally {
      this.saving.set(false);
    }
  }

  private fill(p: { name?: string; phone?: string }): void {
    const saved = { name: p.name ?? '', phone: p.phone ?? '' };
    this.saved.set(saved);
    this.name.set(saved.name);
    this.phone.set(saved.phone);
  }

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
