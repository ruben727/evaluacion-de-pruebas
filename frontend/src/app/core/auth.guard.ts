import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Protege las rutas privadas: sin sesión redirige a /login. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.hasValidSession()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Evita que un usuario con sesión vuelva a login/registro. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (!auth.hasValidSession()) return true;
  return inject(Router).createUrlTree(['/users']);
};
