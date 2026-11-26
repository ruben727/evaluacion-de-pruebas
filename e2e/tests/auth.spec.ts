import { expect, test } from '@playwright/test';
import { login, register, registerAndLogin, uniqueUser } from './helpers';

test.describe('Autenticación', () => {
  test('un usuario se registra e inicia sesión', async ({ page }) => {
    const user = uniqueUser('registro');

    await register(page, user);
    await expect(page.getByTestId('login-success')).toBeVisible();

    await login(page, user.email, user.password);

    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByTestId('current-user')).toHaveText(user.name);
    await expect(page.getByTestId('users-table')).toBeVisible();
  });

  test('el login con credenciales inválidas muestra un error', async ({ page }) => {
    await login(page, 'no-existe@example.com', 'ContraseñaIncorrecta');

    await expect(page.getByTestId('login-error')).toHaveText('Credenciales inválidas');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('logout-button')).toHaveCount(0);
  });

  test('el login con contraseña incorrecta de un usuario existente muestra un error', async ({ page }) => {
    const user = uniqueUser('pwd');
    await register(page, user);

    await login(page, user.email, 'otra-clave-mala');

    await expect(page.getByTestId('login-error')).toHaveText('Credenciales inválidas');
  });

  test('no permite registrar un correo duplicado', async ({ page }) => {
    const user = uniqueUser('dup');
    await register(page, user);

    await page.goto('/register');
    await page.getByTestId('register-name').fill('Otro nombre');
    await page.getByTestId('register-email').fill(user.email);
    await page.getByTestId('register-password').fill(user.password);
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('register-error')).toContainText('ya está registrado');
  });

  test('cerrar sesión lleva al login y protege las rutas privadas', async ({ page }) => {
    await registerAndLogin(page);

    await page.getByTestId('logout-button').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('logout-button')).toHaveCount(0);

    // El guard impide volver a /users sin sesión
    await page.goto('/users');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fusers/);
  });

  test('sin sesión, /users redirige al login', async ({ page }) => {
    await page.goto('/users');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('login-form')).toBeVisible();
  });
});
