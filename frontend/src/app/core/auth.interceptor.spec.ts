import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { makeToken } from '../../testing/jwt';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  const token = makeToken(3600);

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('auth_token', token);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('añade el header Authorization a las peticiones de /api', () => {
    http.get('/api/users').subscribe();
    const req = controller.expectOne('/api/users');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    req.flush({ users: [] });
  });

  it('no añade el token al login', () => {
    http.post('/api/auth/login', {}).subscribe({ error: () => undefined });
    const req = controller.expectOne('/api/auth/login');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
  });

  it('ante un 401 cierra la sesión y redirige al login', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    http.get('/api/users').subscribe({ error: () => undefined });
    controller.expectOne('/api/users').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { expired: 1 } });
  });
});
