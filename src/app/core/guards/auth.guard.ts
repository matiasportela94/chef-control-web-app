import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Sin sesión, al login con la ruta pedida: después de entrar vuelve ahí (ej. el link a /plan del mail de cobro). */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(AuthService).isAuthenticated) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Solo rutas internas: un returnUrl armado por otro no puede mandar a otro sitio. Si no sirve, al panel. */
export function safeReturnUrl(url: string | null): string {
  const internal = !!url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\') && !url.startsWith('/login');
  return internal ? url! : '/dashboard';
}
