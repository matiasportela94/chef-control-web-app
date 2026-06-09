import { Component, HostListener, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api } from '../../api/api';
import { listUsers } from '../../api/fn/user-controller/list-users';
import { createUser } from '../../api/fn/user-controller/create-user';
import { updateUser } from '../../api/fn/user-controller/update-user';
import { deactivateUser } from '../../api/fn/user-controller/deactivate-user';
import { UserResponse } from '../../api/models/user-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatDate } from '../../core/utils/format';
import { extractApiError } from '../../core/utils/api-error';
import { ActionDialogComponent } from '../../shared/components/action-dialog/action-dialog.component';

type Role = 'OWNER' | 'MANAGER' | 'KITCHEN' | 'READONLY';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [ReactiveFormsModule, ActionDialogComponent],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss'
})
export class UsersComponent implements OnInit {
  users   = signal<UserResponse[]>([]);
  loading = signal(true);
  error   = signal<string | null>(null);

  drawerOpen        = signal(false);
  editing           = signal<UserResponse | null>(null);
  saving            = signal(false);
  saveError         = signal<string | null>(null);

  deactivating      = signal<UserResponse | null>(null);
  deactivateLoading = signal(false);

  readonly roles: { value: Role; label: string }[] = [
    { value: 'OWNER',    label: 'Propietario'   },
    { value: 'MANAGER',  label: 'Gerente'        },
    { value: 'KITCHEN',  label: 'Cocina'         },
    { value: 'READONLY', label: 'Solo lectura'   },
  ];

  form: FormGroup;

  constructor(private api: Api, private fb: FormBuilder) {
    this.form = this.fb.group({
      name:  ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      role:  ['KITCHEN', Validators.required],
      phone: [''],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.invoke(listUsers) as unknown;
      this.users.set(await parseBlob<UserResponse[]>(raw));
    } catch {
      this.error.set('No se pudieron cargar los usuarios.');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '', email: '', role: 'KITCHEN', phone: '' });
    this.form.get('email')?.enable();
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(u: UserResponse): void {
    this.editing.set(u);
    this.form.reset({ name: u.name ?? '', email: u.email ?? '', role: u.role ?? 'KITCHEN', phone: u.phone ?? '' });
    this.form.get('email')?.disable();
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.drawerOpen()) this.closeDrawer();
    if (this.deactivating()) this.deactivating.set(null);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveError.set(null);
    const v = this.form.getRawValue();
    try {
      const u = this.editing();
      if (u?.id) {
        const body = {
          name:  v.name,
          role:  v.role as Role,
          ...(v.phone?.trim() ? { phone: v.phone.trim() } : {}),
        };
        await this.api.invoke(updateUser, { id: u.id, body });
      } else {
        const body = {
          name:  v.name,
          email: v.email,
          role:  v.role as Role,
          ...(v.phone?.trim() ? { phone: v.phone.trim() } : {}),
        };
        await this.api.invoke(createUser, { body });
      }
      this.drawerOpen.set(false);
      await this.load();
    } catch (e: any) {
      this.saveError.set(extractApiError(e, 'Error al guardar el usuario'));
    } finally {
      this.saving.set(false);
    }
  }

  async confirmDeactivate(): Promise<void> {
    const u = this.deactivating();
    if (!u?.id) return;
    this.deactivateLoading.set(true);
    try {
      await this.api.invoke(deactivateUser, { id: u.id });
      this.deactivating.set(null);
      await this.load();
    } catch { /* stays in dialog */ }
    finally { this.deactivateLoading.set(false); }
  }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  roleLabel(r?: string): string {
    const found = this.roles.find(x => x.value === r);
    return found ? found.label : (r ?? '—');
  }

  roleClass(r?: string): string {
    const map: Record<string, string> = {
      OWNER:    'badge-owner',
      MANAGER:  'badge-manager',
      KITCHEN:  'badge-kitchen',
      READONLY: 'badge-neutral',
    };
    return r ? (map[r] ?? 'badge-neutral') : 'badge-neutral';
  }

  readonly formatDate = formatDate;
}
