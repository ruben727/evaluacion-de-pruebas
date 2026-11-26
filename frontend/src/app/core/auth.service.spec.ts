import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { makeToken } from '../../testing/jwt';
import { AuthService, isTokenExpired } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('empieza sin sesión', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.token).toBeNull();
  });

  it('login guarda el token y el usuario', () => {
    const token = makeToken(3600);
    const user = { id: 1, name: 'Ana', email: 'ana@example.com', createdAt: '', updatedAt: '' };

    service.login('ana@example.com', 'secreto').subscribe();
    const req = http.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'ana@example.com', password: 'secreto' });
    req.flush({ token, user });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.token).toBe(token);
    expect(service.currentUser()).toEqual(user);
    expect(localStorage.getItem('auth_token')).toBe(token);
  });

  it('register hace POST a /api/auth/register', () => {
    const data = { name: 'Ana', email: 'ana@example.com', password: 'secreto' };
    service.register(data).subscribe();
    const req = http.expectOne('/api/auth/register');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(data);
    req.flush({ user: { id: 1 } }, { status: 201, statusText: 'Created' });
  });

  it('logout borra la sesión y navega a /login', () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    localStorage.setItem('auth_token', makeToken(3600));

    service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('descarta un token expirado guardado en localStorage', () => {
    localStorage.setItem('auth_token', makeToken(-60));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fresh = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);

    expect(fresh.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
  });
});

describe('isTokenExpired', () => {
  it('detecta tokens vigentes, expirados y malformados', () => {
    expect(isTokenExpired(makeToken(60))).toBe(false);
    expect(isTokenExpired(makeToken(-60))).toBe(true);
    expect(isTokenExpired('no-es-un-jwt')).toBe(true);
  });
});
