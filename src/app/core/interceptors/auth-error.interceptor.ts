import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { getErrorMessage } from '../utils/error-messages';

/** Pantallas que se usan sin sesión: un 401 ahí no manda a /login (sería un ida y vuelta). */
const PUBLIC_PATHS = ['/login', '/maintenance'];

/** Varios pedidos rebotan juntos al vencer la sesión: un solo aviso y una sola navegación. */
let redirecting = false;

/**
 * 401 = sin sesión (AUTHENTICATION_REQUIRED): se limpia la sesión local y se va a /login con un aviso.
 * Credenciales inválidas siguen siendo 403 y no pasan por acá.
 */
export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const router      = inject(Router);
  const authService = inject(AuthService);
  const toast       = inject(ToastService);

  return next(req).pipe(
    catchError(error => {
      const path = router.url.split(/[?#]/)[0];
      const isPublic = path === '/' || PUBLIC_PATHS.some(p => path.startsWith(p));
      // El logout se excluye: si respondiera 401, volvería a entrar acá.
      if (error.status === 401 && !req.url.endsWith('/auth/logout') && !isPublic && !redirecting) {
        redirecting = true;
        authService.logout();  // limpia el estado local en el acto; el POST es solo para borrar la cookie
        toast.warning(getErrorMessage('AUTHENTICATION_REQUIRED')!);
        router.navigate(['/login']).finally(() => redirecting = false);
      }
      return throwError(() => error);
    })
  );
};
