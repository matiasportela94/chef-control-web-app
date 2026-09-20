import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { MaintenanceService } from '../services/maintenance.service';

/** 0 = no hubo respuesta (servidor caído, sin red); 502/503/504 = Railway durante un deploy. */
const DOWN_STATUSES = [0, 502, 503, 504];

export const serverErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const maintenance = inject(MaintenanceService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (DOWN_STATUSES.includes(err.status)) maintenance.reportDown();
      return throwError(() => err); // el componente igual se entera: esto no reemplaza su manejo
    })
  );
};
