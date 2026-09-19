import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Bloquea rutas administrativas (p.ej. /audit) a roles que no sean OWNER/MANAGER. */
export const ownerOrManagerGuard: CanActivateFn = () => {
  if (inject(AuthService).isOwnerOrManager) return true;
  return inject(Router).createUrlTree(['/dashboard']);
};
