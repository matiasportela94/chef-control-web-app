import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const router      = inject(Router);
  const authService = inject(AuthService);
  const toast       = inject(ToastService);

  return next(req).pipe(
    catchError(error => {
      if (error.status === 401) {
        const wasAuthenticated = authService.isAuthenticated;
        authService.logout().then(() => {
          if (wasAuthenticated) {
            toast.warning('Sesión expirada', 'Tu sesión venció. Volvé a iniciar sesión.');
          }
          router.navigate(['/login']);
        });
      }
      return throwError(() => error);
    })
  );
};
