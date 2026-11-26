import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { authGuard, guestGuard } from './auth.guard';
import { makeToken } from '../../testing/jwt';

describe('authGuard / guestGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/users' } as RouterStateSnapshot;

  function setup() {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  }

  beforeEach(() => localStorage.clear());

  it('authGuard redirige a /login (con returnUrl) si no hay sesión', () => {
    setup();
    const result = TestBed.runInInjectionContext(() => authGuard(route, state)) as UrlTree;
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/login?returnUrl=%2Fusers');
  });

  it('authGuard deja pasar con una sesión válida', () => {
    localStorage.setItem('auth_token', makeToken(3600));
    setup();
    expect(TestBed.runInInjectionContext(() => authGuard(route, state))).toBe(true);
  });

  it('guestGuard redirige a /users si ya hay sesión', () => {
    localStorage.setItem('auth_token', makeToken(3600));
    setup();
    const result = TestBed.runInInjectionContext(() => guestGuard(route, state)) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/users');
  });

  it('guestGuard deja pasar si no hay sesión', () => {
    setup();
    expect(TestBed.runInInjectionContext(() => guestGuard(route, state))).toBe(true);
  });
});
