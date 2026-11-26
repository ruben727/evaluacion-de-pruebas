import { expect, Page } from '@playwright/test';

/** Genera datos únicos para que las pruebas no choquen entre sí ni con ejecuciones previas. */
export function uniqueUser(prefix = 'e2e') {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: `Usuario ${prefix} ${id}`,
    email: `${prefix}.${id}@example.com`,
    password: 'Secreto123',
  };
}

export async function register(page: Page, user: { name: string; email: string; password: string }) {
  await page.goto('/register');
  await page.getByTestId('register-name').fill(user.name);
  await page.getByTestId('register-email').fill(user.email);
  await page.getByTestId('register-password').fill(user.password);
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/\/login\?registered=1/);
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}

/** Registra un usuario nuevo e inicia sesión con él. */
export async function registerAndLogin(page: Page) {
  const user = uniqueUser('sesion');
  await register(page, user);
  await login(page, user.email, user.password);
  await expect(page).toHaveURL(/\/users$/);
  return user;
}

export function userRow(page: Page, email: string) {
  return page.locator(`[data-testid="user-row"][data-email="${email}"]`);
}
