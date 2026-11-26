import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { User } from '../../core/models';
import { Users } from './users';

const ana: User = { id: 1, name: 'Ana', email: 'ana@example.com', createdAt: '2026-01-01T00:00:00Z', updatedAt: '' };
const luis: User = { id: 2, name: 'Luis', email: 'luis@example.com', createdAt: '2026-01-01T00:00:00Z', updatedAt: '' };

describe('Users', () => {
  let fixture: ComponentFixture<Users>;
  let el: HTMLElement;
  let http: HttpTestingController;

  const q = <T extends Element = HTMLElement>(testId: string) => el.querySelector<T & HTMLElement>(`[data-testid="${testId}"]`);
  const qa = (testId: string) => Array.from(el.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`));

  function fill(testId: string, value: string) {
    const input = q<HTMLInputElement>(testId) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Users],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Users);
    el = fixture.nativeElement;
    await fixture.whenStable();
    http.expectOne('/api/users').flush({ users: [ana, luis] });
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('lista los usuarios en una tabla', () => {
    expect(qa('user-row')).toHaveLength(2);
    expect(qa('user-email').map((e) => e.textContent?.trim())).toEqual(['ana@example.com', 'luis@example.com']);
  });

  it('crea un usuario', async () => {
    q('new-user-button')!.click();
    await fixture.whenStable();
    fill('user-name-input', 'Eva');
    fill('user-email-input', 'eva@example.com');
    fill('user-password-input', 'secreto1');
    q('user-form-submit')!.click();

    const req = http.expectOne('/api/users');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Eva', email: 'eva@example.com', password: 'secreto1' });
    req.flush({ user: { ...ana, id: 3, name: 'Eva', email: 'eva@example.com' } }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    expect(qa('user-row')).toHaveLength(3);
    expect(q('alert-success')?.textContent).toContain('Eva');
    expect(q('user-form-dialog')).toBeNull();
  });

  it('exige contraseña al crear', async () => {
    q('new-user-button')!.click();
    await fixture.whenStable();
    fill('user-name-input', 'Eva');
    fill('user-email-input', 'eva@example.com');
    q('user-form-submit')!.click();
    await fixture.whenStable();

    http.expectNone('/api/users');
    expect(q('user-form-dialog')).not.toBeNull();
  });

  it('edita un usuario sin enviar contraseña si se deja vacía', async () => {
    qa('edit-user-button')[0].click();
    await fixture.whenStable();
    expect((q('user-name-input') as unknown as HTMLInputElement).value).toBe('Ana');

    fill('user-name-input', 'Ana María');
    q('user-form-submit')!.click();

    const req = http.expectOne('/api/users/1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Ana María', email: 'ana@example.com' });
    req.flush({ user: { ...ana, name: 'Ana María' } });
    await fixture.whenStable();

    expect(qa('user-name')[0].textContent).toContain('Ana María');
  });

  it('pide confirmación antes de eliminar y no borra si se cancela', async () => {
    qa('delete-user-button')[1].click();
    await fixture.whenStable();
    expect(q('confirm-dialog')?.textContent).toContain('Luis');

    q('cancel-delete-button')!.click();
    await fixture.whenStable();

    http.expectNone('/api/users/2');
    expect(q('confirm-dialog')).toBeNull();
    expect(qa('user-row')).toHaveLength(2);
  });

  it('elimina tras confirmar', async () => {
    qa('delete-user-button')[1].click();
    await fixture.whenStable();
    q('confirm-delete-button')!.click();

    const req = http.expectOne('/api/users/2');
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'Usuario eliminado', id: 2 });
    await fixture.whenStable();

    expect(qa('user-row')).toHaveLength(1);
    expect(q('alert-success')?.textContent).toContain('eliminado');
  });

  it('muestra el error del backend (409) en el formulario', async () => {
    q('new-user-button')!.click();
    await fixture.whenStable();
    fill('user-name-input', 'Otra Ana');
    fill('user-email-input', 'ana@example.com');
    fill('user-password-input', 'secreto1');
    q('user-form-submit')!.click();

    http
      .expectOne('/api/users')
      .flush({ error: { status: 409, message: 'El correo ya está registrado' } }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();

    expect(q('user-form-error')?.textContent).toContain('ya está registrado');
  });
});
