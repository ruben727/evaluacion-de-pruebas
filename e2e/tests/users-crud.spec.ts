import { expect, test } from '@playwright/test';
import { login, registerAndLogin, uniqueUser, userRow } from './helpers';

test.describe('CRUD de usuarios', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test('crear, editar y eliminar un usuario', async ({ page }) => {
    const nuevo = uniqueUser('crud');

    // ---- Crear ----
    await page.getByTestId('new-user-button').click();
    await expect(page.getByTestId('user-form-dialog')).toBeVisible();
    await page.getByTestId('user-name-input').fill(nuevo.name);
    await page.getByTestId('user-email-input').fill(nuevo.email);
    await page.getByTestId('user-password-input').fill(nuevo.password);
    await page.getByTestId('user-form-submit').click();

    await expect(page.getByTestId('user-form-dialog')).toBeHidden();
    await expect(page.getByTestId('alert-success')).toContainText('creado');
    const row = userRow(page, nuevo.email);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('user-name')).toHaveText(nuevo.name);

    // ---- Editar ----
    const nombreEditado = `${nuevo.name} (editado)`;
    await row.getByTestId('edit-user-button').click();
    await expect(page.getByTestId('user-name-input')).toHaveValue(nuevo.name);
    await page.getByTestId('user-name-input').fill(nombreEditado);
    await page.getByTestId('user-form-submit').click();

    await expect(page.getByTestId('alert-success')).toContainText('actualizado');
    await expect(row.getByTestId('user-name')).toHaveText(nombreEditado);

    // El cambio persiste tras recargar
    await page.reload();
    await expect(userRow(page, nuevo.email).getByTestId('user-name')).toHaveText(nombreEditado);

    // ---- Eliminar (cancelar primero, luego confirmar) ----
    await userRow(page, nuevo.email).getByTestId('delete-user-button').click();
    await expect(page.getByTestId('confirm-dialog')).toContainText(nombreEditado);
    await page.getByTestId('cancel-delete-button').click();
    await expect(page.getByTestId('confirm-dialog')).toBeHidden();
    await expect(userRow(page, nuevo.email)).toBeVisible();

    await userRow(page, nuevo.email).getByTestId('delete-user-button').click();
    await page.getByTestId('confirm-delete-button').click();

    await expect(page.getByTestId('alert-success')).toContainText('eliminado');
    await expect(userRow(page, nuevo.email)).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('users-table')).toBeVisible();
    await expect(userRow(page, nuevo.email)).toHaveCount(0);
  });

  test('el usuario creado desde el CRUD puede iniciar sesión', async ({ page }) => {
    const nuevo = uniqueUser('login-crud');
    await page.getByTestId('new-user-button').click();
    await page.getByTestId('user-name-input').fill(nuevo.name);
    await page.getByTestId('user-email-input').fill(nuevo.email);
    await page.getByTestId('user-password-input').fill(nuevo.password);
    await page.getByTestId('user-form-submit').click();
    await expect(userRow(page, nuevo.email)).toBeVisible();

    await page.getByTestId('logout-button').click();
    await login(page, nuevo.email, nuevo.password);

    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByTestId('current-user')).toHaveText(nuevo.name);
  });

  test('valida el formulario y muestra errores del backend', async ({ page }) => {
    // Validación del cliente: el formulario vacío no se envía
    await page.getByTestId('new-user-button').click();
    await page.getByTestId('user-form-submit').click();
    await expect(page.getByTestId('user-form-dialog')).toBeVisible();
    await expect(page.getByTestId('user-form-dialog')).toContainText('Ingresa un correo válido');

    // Error del backend: correo duplicado (409)
    const emailExistente = await page.getByTestId('user-email').first().textContent();
    await page.getByTestId('user-name-input').fill('Duplicado');
    await page.getByTestId('user-email-input').fill(emailExistente!.trim());
    await page.getByTestId('user-password-input').fill('Secreto123');
    await page.getByTestId('user-form-submit').click();

    await expect(page.getByTestId('user-form-error')).toContainText('ya está registrado');
    await page.getByTestId('user-form-cancel').click();
    await expect(page.getByTestId('user-form-dialog')).toBeHidden();
  });
});
