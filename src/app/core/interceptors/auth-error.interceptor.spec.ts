import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { authErrorInterceptor } from './auth-error.interceptor';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

describe('authErrorInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let url: string;
  const auth   = jasmine.createSpyObj<AuthService>('AuthService', ['logout']);
  const toast  = jasmine.createSpyObj<ToastService>('ToastService', ['warning']);
  const router = { get url() { return url; }, navigate: jasmine.createSpy('navigate').and.resolveTo(true) };

  beforeEach(() => {
    url = '/dashboard';
    auth.logout.calls.reset(); toast.warning.calls.reset(); router.navigate.calls.reset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authErrorInterceptor])), provideHttpClientTesting(),
        { provide: AuthService, useValue: auth }, { provide: ToastService, useValue: toast }, { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  const fail = (path: string, status: number) => {
    http.get(path).subscribe({ error: () => {} });
    backend.expectOne(path).flush({ errorCode: 'X' }, { status, statusText: '' });
  };

  it('401 en una pantalla con sesión: un solo aviso y una sola navegación aunque rebote todo junto', async () => {
    fail('/products', 401);
    fail('/alerts', 401);
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledOnceWith('Tu sesión terminó, volvé a entrar');
    expect(router.navigate).toHaveBeenCalledOnceWith(['/login']);
    await new Promise(r => setTimeout(r));  // el finally de la navegación libera el candado para el próximo test
  });

  it('no hace nada en las pantallas sin sesión, con el logout ni con un 403', async () => {
    url = '/login?view=register'; fail('/products', 401);
    url = '/';                    fail('/products', 401);
    url = '/dashboard';           fail('/auth/logout', 401);
    fail('/auth/login', 403);
    expect(auth.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    fail('/products', 401);  // control: el mismo 401 en una pantalla con sesión sí actúa
    expect(router.navigate).toHaveBeenCalledOnceWith(['/login']);
    await new Promise(r => setTimeout(r));
  });
});
