import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { apiErrorMessage } from '../../core/api-error';
import { User, UserPayload } from '../../core/models';
import { UsersService } from '../../core/users.service';

type FormMode = { kind: 'create' } | { kind: 'edit'; user: User };

@Component({
  selector: 'app-users',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './users.html',
  styleUrl: './users.css',
})
export class Users implements OnInit {
  private readonly usersService = inject(UsersService);

  protected readonly users = signal<User[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly message = signal<{ type: 'success' | 'error'; text: string } | null>(null);
  protected readonly formError = signal<string | null>(null);

  /** Formulario de alta/edición abierto (null = cerrado) */
  protected readonly formMode = signal<FormMode | null>(null);
  /** Usuario pendiente de confirmación de borrado (null = diálogo cerrado) */
  protected readonly pendingDelete = signal<User | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.minLength(6)]],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.usersService.list().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.message.set({ type: 'error', text: apiErrorMessage(err, 'No se pudieron cargar los usuarios') });
      },
    });
  }

  protected invalid(field: 'name' | 'email' | 'password'): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }

  openCreate(): void {
    this.form.reset();
    // La contraseña es obligatoria al crear, opcional al editar
    this.form.controls.password.setValidators([Validators.required, Validators.minLength(6)]);
    this.form.controls.password.updateValueAndValidity();
    this.formError.set(null);
    this.formMode.set({ kind: 'create' });
  }

  openEdit(user: User): void {
    this.form.reset({ name: user.name, email: user.email, password: '' });
    this.form.controls.password.setValidators([Validators.minLength(6)]);
    this.form.controls.password.updateValueAndValidity();
    this.formError.set(null);
    this.formMode.set({ kind: 'edit', user });
  }

  closeForm(): void {
    this.formMode.set(null);
  }

  save(): void {
    const mode = this.formMode();
    if (!mode) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, email, password } = this.form.getRawValue();
    const payload: UserPayload = { name, email };
    if (password) payload.password = password;

    this.saving.set(true);
    this.formError.set(null);

    const request$ =
      mode.kind === 'create' ? this.usersService.create(payload) : this.usersService.update(mode.user.id, payload);

    request$.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.formMode.set(null);
        if (mode.kind === 'create') {
          this.users.update((list) => [...list, saved]);
          this.message.set({ type: 'success', text: `Usuario "${saved.name}" creado` });
        } else {
          this.users.update((list) => list.map((u) => (u.id === saved.id ? saved : u)));
          this.message.set({ type: 'success', text: `Usuario "${saved.name}" actualizado` });
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(apiErrorMessage(err, 'No se pudo guardar el usuario'));
      },
    });
  }

  askDelete(user: User): void {
    this.pendingDelete.set(user);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  confirmDelete(): void {
    const user = this.pendingDelete();
    if (!user) return;
    this.saving.set(true);
    this.usersService.remove(user.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.pendingDelete.set(null);
        this.users.update((list) => list.filter((u) => u.id !== user.id));
        this.message.set({ type: 'success', text: `Usuario "${user.name}" eliminado` });
      },
      error: (err) => {
        this.saving.set(false);
        this.pendingDelete.set(null);
        this.message.set({ type: 'error', text: apiErrorMessage(err, 'No se pudo eliminar el usuario') });
      },
    });
  }
}
