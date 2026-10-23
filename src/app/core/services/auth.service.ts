import { Injectable, signal } from '@angular/core';
import { Api } from '../../api/api';
import { login } from '../../api/fn/auth-controller/login';
import { register } from '../../api/fn/auth-controller/register';
import { signInWithGoogle } from '../../api/fn/auth-controller/sign-in-with-google';
import { linkGoogleAccount } from '../../api/fn/auth-controller/link-google-account';
import { unlinkGoogleAccount } from '../../api/fn/auth-controller/unlink-google-account';
import { GoogleSignInRequest } from '../../api/models/google-sign-in-request';
import { forgotPassword } from '../../api/fn/auth-controller/forgot-password';
import { switchRestaurant } from '../../api/fn/auth-controller/switch-restaurant';
import { LoginRequest } from '../../api/models/login-request';
import { LoginResponse } from '../../api/models/login-response';
import { RegisterRequest } from '../../api/models/register-request';
import { ForgotPasswordRequest } from '../../api/models/forgot-password-request';
import { RestaurantSummary } from '../../api/models/restaurant-summary';
import { parseBlob } from '../utils/parse-blob';
import { logout as logoutFn } from '../../api/fn/auth-controller/logout';

const USER_KEY = 'cc_user';

export interface CurrentUser {
  name: string;
  email: string;
  role: string;
  permissions: string[];
  /** Features del plan de la cuenta del local activo. Falta en sesiones guardadas antes de que existiera. */
  features?: string[];
  /** Tiene una cuenta de Google vinculada. Falta en sesiones guardadas antes de que existiera. */
  googleLinked?: boolean;
  restaurantId: string;
  restaurantName: string;
  restaurants: RestaurantSummary[];
  expiresAt?: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser = signal<CurrentUser | null>(this.loadUser());

  constructor(private api: Api) {}

  get isAuthenticated(): boolean {
    const user = this.currentUser();
    if (!user) return false;
    if (user.expiresAt && Date.now() > user.expiresAt) {
      sessionStorage.removeItem(USER_KEY);
      this.currentUser.set(null);
      return false;
    }
    return true;
  }

  async login(body: LoginRequest): Promise<LoginResponse> {
    const response = await parseBlob<LoginResponse>(await this.api.invoke(login, { body }) as unknown);
    this.persistUser(response);
    return response;
  }

  async register(body: RegisterRequest): Promise<LoginResponse> {
    const response = await parseBlob<LoginResponse>(await this.api.invoke(register, { body }) as unknown);
    this.persistUser(response);
    return response;
  }

  /** Entra o da de alta con Google. Usuario nuevo sin restaurantName → 404 GOOGLE_ACCOUNT_NOT_REGISTERED. */
  async googleSignIn(body: GoogleSignInRequest): Promise<LoginResponse> {
    const response = await parseBlob<LoginResponse>(await this.api.invoke(signInWithGoogle, { body }) as unknown);
    this.persistUser(response);
    return response;
  }

  /** Vincula la cuenta de Google del token al usuario logueado. */
  async linkGoogle(idToken: string): Promise<void> {
    await this.api.invoke(linkGoogleAccount, { body: { idToken } });
    this.patchUser({ googleLinked: true });
  }

  /** Desvincula Google: el token confirma que es la cuenta vinculada y `newPassword` reemplaza la contraseña. */
  async unlinkGoogle(idToken: string, newPassword: string): Promise<void> {
    await this.api.invoke(unlinkGoogleAccount, { body: { idToken, newPassword } });
    this.patchUser({ googleLinked: false });
  }

  async forgotPassword(body: ForgotPasswordRequest): Promise<void> {
    await this.api.invoke(forgotPassword, { body });
  }

  async switchToRestaurant(restaurantId: string): Promise<void> {
    const response = await parseBlob<LoginResponse>(
      await this.api.invoke(switchRestaurant, { body: { restaurantId } }) as unknown
    );
    this.persistUser(response);
  }

  async logout(): Promise<void> {
    try {
      await this.api.invoke(logoutFn);
    } catch { /* ignorar errores de red al hacer logout */ }
    sessionStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
  }

  private persistUser(r: LoginResponse): void {
    const user: CurrentUser = {
      name:           r.name                ?? '',
      email:          r.email               ?? '',
      role:           r.role                ?? '',
      permissions:    r.permissions          ?? [],
      features:       r.features             ?? [],
      googleLinked:   r.googleLinked         ?? false,
      restaurantId:   r.activeRestaurantId  ?? '',
      restaurantName: r.activeRestaurantName ?? '',
      restaurants:    r.restaurants          ?? [],
      expiresAt:      r.expiresAt,
    };
    this.storeUser(user);
  }

  private patchUser(changes: Partial<CurrentUser>): void {
    const user = this.currentUser();
    if (user) this.storeUser({ ...user, ...changes });
  }

  private storeUser(user: CurrentUser): void {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }

  /** Permiso efectivo (rol + overrides), ya resuelto por el backend y guardado en el login. */
  hasPermission(permission: string): boolean {
    return this.currentUser()?.permissions.includes(permission) ?? false;
  }

  /**
   * La feature está en el plan de la cuenta. Sirve para no ofrecer lo que el backend va a rechazar; quien
   * decide es el backend (403 PLAN_FEATURE_REQUIRED). Una sesión vieja sin el dato no esconde nada.
   */
  hasFeature(feature: string): boolean {
    const features = this.currentUser()?.features;
    return features ? features.includes(feature) : true;
  }

  /** Vuelve a pedir la sesión del local activo: trae el plan nuevo después de pagar. */
  async refreshSession(): Promise<void> {
    const id = this.currentUser()?.restaurantId;
    if (id) await this.switchToRestaurant(id);
  }

  private loadUser(): CurrentUser | null {
    const s = sessionStorage.getItem(USER_KEY);
    return s ? JSON.parse(s) : null;
  }
}
