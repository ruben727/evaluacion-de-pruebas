import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'users' },
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Iniciar sesión',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    title: 'Registro',
    loadComponent: () => import('./pages/register/register').then((m) => m.Register),
  },
  {
    path: 'users',
    canActivate: [authGuard],
    title: 'Usuarios',
    loadComponent: () => import('./pages/users/users').then((m) => m.Users),
  },
  { path: '**', redirectTo: 'users' },
];
