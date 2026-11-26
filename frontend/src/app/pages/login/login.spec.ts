import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Login } from './login';

describe('Login', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function fill(el: HTMLElement, testId: string, value: string) {
    const input = el.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('no envía la petición si el formulario es inválido', async () => {
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('[data-testid="login-submit"]')!.click();
    await fixture.whenStable();

    http.expectNone('/api/auth/login');
    expect(el.textContent).toContain('Ingresa un correo válido');
  });

  it('muestra el error del backend con credenciales inválidas', async () => {
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    fill(el, 'login-email', 'ana@example.com');
    fill(el, 'login-password', 'mala');
    el.querySelector<HTMLButtonElement>('[data-testid="login-submit"]')!.click();

    http
      .expectOne('/api/auth/login')
      .flush({ error: { status: 401, message: 'Credenciales inválidas' } }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    expect(el.querySelector('[data-testid="login-error"]')?.textContent).toContain('Credenciales inválidas');
  });

  it('navega a /users tras un login correcto', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    fill(el, 'login-email', 'ana@example.com');
    fill(el, 'login-password', 'secreto');
    el.querySelector<HTMLButtonElement>('[data-testid="login-submit"]')!.click();

    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    http.expectOne('/api/auth/login').flush({ token: `h.${payload}.s`, user: { id: 1, name: 'Ana' } });
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith('/users');
  });
});
