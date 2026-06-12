import { Injectable, signal } from '@angular/core';
import { Api } from '../../api/api';
import { login } from '../../api/fn/auth-controller/login';
import { register } from '../../api/fn/auth-controller/register';
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
      restaurantId:   r.activeRestaurantId  ?? '',
      restaurantName: r.activeRestaurantName ?? '',
      restaurants:    r.restaurants          ?? [],
      expiresAt:      r.expiresAt,
    };
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }

  private loadUser(): CurrentUser | null {
    const s = sessionStorage.getItem(USER_KEY);
    return s ? JSON.parse(s) : null;
  }
}
