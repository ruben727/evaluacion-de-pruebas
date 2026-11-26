import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthService } from './core/auth.service';

function fakeToken(): string {
  const payload = btoa(JSON.stringify({ sub: '1', exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `header.${payload}.firma`;
}

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('se crea la aplicación', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('muestra el título y oculta "Cerrar sesión" si no hay sesión', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="brand"]')?.textContent).toContain('Gestión de usuarios');
    expect(el.querySelector('[data-testid="logout-button"]')).toBeNull();
  });

  it('muestra el usuario y el botón "Cerrar sesión" con sesión iniciada', async () => {
    localStorage.setItem('auth_token', fakeToken());
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, name: 'Ana', email: 'ana@example.com' }));
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
    expect(el.querySelector('[data-testid="current-user"]')?.textContent).toContain('Ana');
    expect(el.querySelector('[data-testid="logout-button"]')).not.toBeNull();
  });
});
