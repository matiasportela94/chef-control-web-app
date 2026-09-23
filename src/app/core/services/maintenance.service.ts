import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Segundos entre reintentos: arranca corto y se va estirando si el backend no vuelve. */
const FIRST_DELAY = 5;
const MAX_DELAY   = 30;

/**
 * Detecta que el backend no responde y lleva a /maintenance, reintentando solo hasta que vuelve.
 * Lo prende `serverErrorInterceptor` ante un status 0 / 502 / 503 / 504 — o sea, servidor caído o
 * deploy en curso. Los 4xx no pasan por acá: son errores de negocio y los traduce extractApiError.
 */
@Injectable({ providedIn: 'root' })
export class MaintenanceService {

  /**
   * HttpClient sin interceptores (HttpBackend directo): el ping de salud no puede volver a
   * disparar este mismo servicio ni arrastrar el manejo de 401, o se realimenta.
   */
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly router = inject(Router);

  readonly isDown      = signal(false);
  readonly checking    = signal(false);
  readonly secondsLeft = signal(FIRST_DELAY);

  private returnUrl = '/dashboard';
  private delay = FIRST_DELAY;
  private ticker?: ReturnType<typeof setInterval>;

  /** Idempotente: varias requests fallando a la vez no apilan navegaciones ni timers. */
  reportDown(): void {
    if (this.isDown()) return;

    const current = this.router.url;
    if (current && !current.startsWith('/maintenance')) this.returnUrl = current;

    this.isDown.set(true);
    this.delay = FIRST_DELAY;
    this.secondsLeft.set(FIRST_DELAY);
    void this.router.navigate(['/maintenance']);
    this.startTicker();
  }

  async retryNow(): Promise<void> {
    if (this.checking()) return;
    this.checking.set(true);
    const ok = await this.ping();
    this.checking.set(false);
    if (ok) this.recover();
    else this.backOff();
  }

  private startTicker(): void {
    clearInterval(this.ticker);
    this.ticker = setInterval(() => {
      if (this.checking()) return;
      const left = this.secondsLeft() - 1;
      if (left > 0) { this.secondsLeft.set(left); return; }
      void this.retryNow();
    }, 1000);
  }

  private backOff(): void {
    this.delay = Math.min(this.delay * 2, MAX_DELAY);
    this.secondsLeft.set(this.delay);
  }

  private recover(): void {
    clearInterval(this.ticker);
    this.ticker = undefined;
    this.isDown.set(false);
    void this.router.navigateByUrl(this.returnUrl);
  }

  private async ping(): Promise<boolean> {
    try {
      await firstValueFrom(this.http.get(`${environment.apiUrl}/actuator/health`));
      return true;
    } catch {
      return false;
    }
  }
}
