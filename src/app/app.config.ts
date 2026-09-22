import { LOCALE_ID, ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { ApiConfiguration } from './api/api-configuration';
import { credentialsInterceptor } from './core/interceptors/credentials.interceptor';
import { authErrorInterceptor } from './core/interceptors/auth-error.interceptor';
import { blobErrorInterceptor } from './core/interceptors/blob-error.interceptor';
import { serverErrorInterceptor } from './core/interceptors/server-error.interceptor';

// Sin esto los pipes number/percent/currency caen en en-US y muestran "1,234.56": punto decimal
// y coma de miles, al revés de como se lee acá. Los helpers de core/utils/format ya pasaban
// 'es-AR' a mano, así que convivían dos formatos según qué usara cada pantalla.
registerLocaleData(localeEsAr);

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'es-AR' },
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([blobErrorInterceptor, credentialsInterceptor, authErrorInterceptor, serverErrorInterceptor])
    ),
    {
      provide: ApiConfiguration,
      useValue: { rootUrl: environment.apiUrl } satisfies ApiConfiguration
    }
  ]
};
