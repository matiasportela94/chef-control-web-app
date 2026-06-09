import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, from, switchMap, throwError } from 'rxjs';

export const blobErrorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (!(error.error instanceof Blob)) return throwError(() => error);
      return from(error.error.text()).pipe(
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
