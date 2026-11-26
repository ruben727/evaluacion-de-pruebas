import { HttpErrorResponse } from '@angular/common/http';
import { ApiErrorBody } from './models';

/** Convierte un error HTTP del backend en un mensaje legible para el usuario. */
export function apiErrorMessage(err: unknown, fallback = 'Ocurrió un error inesperado'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'No se pudo conectar con el servidor';
    const body = err.error as ApiErrorBody | null;
    const details = body?.error?.details;
    if (details && Object.keys(details).length > 0) {
      return Object.values(details).join('. ');
    }
    if (body?.error?.message) return body.error.message;
  }
  return fallback;
}
