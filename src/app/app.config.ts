import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { ApiConfiguration } from './api/api-configuration';
import { credentialsInterceptor } from './core/interceptors/credentials.interceptor';
import { authErrorInterceptor } from './core/interceptors/auth-error.interceptor';
import { blobErrorInterceptor } from './core/interceptors/blob-error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([blobErrorInterceptor, credentialsInterceptor, authErrorInterceptor])
    ),
    {
      provide: ApiConfiguration,
      useValue: { rootUrl: environment.apiUrl } satisfies ApiConfiguration
    }
  ]
};
