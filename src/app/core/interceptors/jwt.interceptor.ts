// Este interceptor fue reemplazado por credentialsInterceptor (httpOnly cookie).
// Se mantiene el archivo vacío para no romper imports residuales.
import { HttpInterceptorFn } from '@angular/common/http';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => next(req);
