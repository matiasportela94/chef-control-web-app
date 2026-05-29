import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  if (inject(AuthService).token()) return true;
  return inject(Router).createUrlTree(['/login']);
};
