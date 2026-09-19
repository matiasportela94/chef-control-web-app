import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Guard genérico por permiso — usar para cualquier ruta nueva en vez de hardcodear roles. */
export function permissionGuard(permission: string): CanActivateFn {
  return () => {
    if (inject(AuthService).hasPermission(permission)) return true;
    return inject(Router).createUrlTree(['/dashboard']);
  };
}
