import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { I18nService } from '../services/i18n.service';

let lastToastAt = 0;

/**
 * 403 PLAN_FEATURE_REQUIRED (la función no está en el plan de la cuenta): un aviso que lleva a mirar los
 * planes. Va primero en la cadena para recibir el error ya parseado por blobErrorInterceptor. Un toast cada
 * pocos segundos como mucho: una pantalla puede disparar varias requests gateadas juntas.
 * El error sigue su curso: cada pantalla lo muestra como cualquier otro.
 */
export const planFeatureInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const i18n = inject(I18nService);
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 403 && error.error?.errorCode === 'PLAN_FEATURE_REQUIRED' && Date.now() - lastToastAt > 4000) {
        lastToastAt = Date.now();
        toast.warning(i18n.t('planGate.toastTitle'), i18n.t('errors.PLAN_FEATURE_REQUIRED'));
      }
      return throwError(() => error);
    })
  );
};
