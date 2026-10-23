import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, Output, ViewChild } from '@angular/core';
import { environment } from '../../../../environments/environment';

/** Google Identity Services: lo define el script de Google, sin paquete npm. */
declare const google: any;

let gisScript: Promise<void> | null = null;

function loadGoogleIdentityServices(): Promise<void> {
  return gisScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { gisScript = null; reject(new Error('gsi')); };
    document.head.appendChild(script);
  });
}

/**
 * Botón oficial "Acceder con Google". Emite el ID token, que el padre manda a POST /auth/google.
 * Sin `googleClientId` en el environment no se dibuja nada; si el script de Google no carga (sin red,
 * bloqueador), tampoco: el formulario de email sigue andando igual.
 */
@Component({
  selector: 'app-google-button',
  standalone: true,
  template: `@if (enabled) { <div #host class="google-btn"></div> }`,
  styles: [`.google-btn { display: flex; justify-content: center; min-height: 44px; }`]
})
export class GoogleButtonComponent implements AfterViewInit {
  @Input() text: 'signin_with' | 'signup_with' | 'continue_with' = 'continue_with';
  @Output() credential = new EventEmitter<string>();
  @ViewChild('host') private host?: ElementRef<HTMLElement>;

  readonly enabled = !!environment.googleClientId;

  constructor(private zone: NgZone) {}

  async ngAfterViewInit(): Promise<void> {
    if (!this.enabled || !this.host) return;
    try { await loadGoogleIdentityServices(); } catch { return; }
    const el = this.host.nativeElement;
    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      // El callback llega fuera de la zona de Angular: sin zone.run la vista no se entera.
      callback: (r: { credential: string }) => this.zone.run(() => this.credential.emit(r.credential)),
    });
    google.accounts.id.renderButton(el, {
      theme: 'filled_black', size: 'large', shape: 'pill', text: this.text, locale: 'es',
      width: Math.min(el.offsetWidth || 320, 400),  // Google acepta hasta 400px
    });
  }
}
