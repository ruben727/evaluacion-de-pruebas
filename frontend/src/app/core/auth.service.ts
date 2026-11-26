import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { LoginResponse, User, UserPayload } from './models';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

/** Decodifica el payload de un JWT (sin verificar la firma: eso lo hace el backend). */
export function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string, now = Date.now()): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  return typeof payload.exp === 'number' && payload.exp * 1000 <= now;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly tokenSignal = signal<string | null>(this.readValidToken());
  private readonly userSignal = signal<User | null>(this.readUser());

  readonly currentUser = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.tokenSignal() !== null);

  get token(): string | null {
    const token = this.tokenSignal();
    if (token && isTokenExpired(token)) {
      this.clearSession();
      return null;
    }
    return token;
  }

  register(data: UserPayload): Observable<{ user: User }> {
    return this.http.post<{ user: User }>('/api/auth/register', data);
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', { email, password }).pipe(
      tap(({ token, user }) => {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        this.tokenSignal.set(token);
        this.userSignal.set(user);
      }),
    );
  }

  logout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /** Comprueba (de forma síncrona) si hay una sesión vigente. */
  hasValidSession(): boolean {
    return this.token !== null;
  }

  clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.tokenSignal.set(null);
    this.userSignal.set(null);
  }

  private readValidToken(): string | null {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || isTokenExpired(token)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      return null;
    }
    return token;
  }

  private readUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }
}
