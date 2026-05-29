import { Injectable, signal } from '@angular/core';
import { Api } from '../../api/api';
import { login } from '../../api/fn/auth-controller/login';
import { register } from '../../api/fn/auth-controller/register';
import { forgotPassword } from '../../api/fn/auth-controller/forgot-password';
import { LoginRequest } from '../../api/models/login-request';
import { LoginResponse } from '../../api/models/login-response';
import { RegisterRequest } from '../../api/models/register-request';
import { ForgotPasswordRequest } from '../../api/models/forgot-password-request';

export interface CurrentUser {
  name: string;
  email: string;
  restaurantName: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly token       = signal<string | null>(null);
  readonly currentUser = signal<CurrentUser | null>(null);

  constructor(private api: Api) {}

  async login(body: LoginRequest): Promise<LoginResponse> {
    const raw = await this.api.invoke(login, { body }) as unknown;
    const response = await this.parseBlob<LoginResponse>(raw);
    this.persist(response);
    return response;
  }

  async register(body: RegisterRequest): Promise<LoginResponse> {
    const raw = await this.api.invoke(register, { body }) as unknown;
    const response = await this.parseBlob<LoginResponse>(raw);
    this.persist(response);
    return response;
  }

  async forgotPassword(body: ForgotPasswordRequest): Promise<void> {
    await this.api.invoke(forgotPassword, { body });
  }

  logout(): void {
    this.token.set(null);
    this.currentUser.set(null);
  }

  private persist(r: LoginResponse): void {
    if (r.token) this.token.set(r.token);
    this.currentUser.set({
      name:           r.name                ?? '',
      email:          r.email               ?? '',
      restaurantName: r.activeRestaurantName ?? ''
    });
  }

  private async parseBlob<T>(raw: unknown): Promise<T> {
    if (raw instanceof Blob) return JSON.parse(await raw.text()) as T;
    return raw as T;
  }
}
