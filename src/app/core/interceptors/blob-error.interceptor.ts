import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, from, switchMap, throwError } from 'rxjs';

/**
 * Deja el cuerpo del error como objeto (`{ errorCode, message }`) para que `extractApiError` lo lea.
 * El cliente generado pide `blob` en los endpoints con cuerpo y `text` en los que responden 204:
 * en los dos casos el error llega sin parsear.
 */
export const blobErrorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const raw = error.error;
      if (!(raw instanceof Blob) && typeof raw !== 'string') return throwError(() => error);
      return from(raw instanceof Blob ? raw.text() : Promise.resolve(raw)).pipe(
        switchMap(text => {
          try {
            const body = JSON.parse(text);
            return throwError(() => new HttpErrorResponse({
              error: body,
              headers: error.headers,
              status: error.status,
              statusText: error.statusText,
              url: error.url ?? undefined,
            }));
          } catch {
            return throwError(() => error);
          }
        })
      );
    })
  );
};
