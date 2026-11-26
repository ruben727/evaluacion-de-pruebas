import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { User, UserPayload } from './models';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/users';

  list(): Observable<User[]> {
    return this.http.get<{ users: User[] }>(this.baseUrl).pipe(map((r) => r.users));
  }

  get(id: number): Observable<User> {
    return this.http.get<{ user: User }>(`${this.baseUrl}/${id}`).pipe(map((r) => r.user));
  }

  create(data: UserPayload): Observable<User> {
    return this.http.post<{ user: User }>(this.baseUrl, data).pipe(map((r) => r.user));
  }

  update(id: number, data: Partial<UserPayload>): Observable<User> {
    return this.http.put<{ user: User }>(`${this.baseUrl}/${id}`, data).pipe(map((r) => r.user));
  }

  remove(id: number): Observable<void> {
    return this.http.delete<unknown>(`${this.baseUrl}/${id}`).pipe(map(() => undefined));
  }
}
