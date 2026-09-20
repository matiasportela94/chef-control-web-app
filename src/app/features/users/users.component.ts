import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../api/api';
import { AuthService } from '../../core/services/auth.service';
import { listUsers } from '../../api/fn/user-controller/list-users';
import { createUser } from '../../api/fn/user-controller/create-user';
import { updateUser } from '../../api/fn/user-controller/update-user';
import { deactivateUser } from '../../api/fn/user-controller/deactivate-user';
import { getPermissions } from '../../api/fn/user-controller/get-permissions';
import { setPermissions } from '../../api/fn/user-controller/set-permissions';
import { list2 as listRoles } from '../../api/fn/role-controller/list-2';
import { UserResponse } from '../../api/models/user-response';
import { UserPermissionsResponse } from '../../api/models/user-permissions-response';
import { RoleResponse } from '../../api/models/role-response';
import { OverrideItem } from '../../api/models/override-item';
import { PermissionKey, PERMISSION_MODULES, allPermissionKeys } from '../../core/utils/permission-catalog';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatDate } from '../../core/utils/format';
import { extractApiError } from '../../core/utils/api-error';
import { ActionDialogComponent } from '../../shared/components/action-dialog/action-dialog.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';
import { isFormFieldInvalid } from '../../core/utils/form';
import { SelectComponent, SelectOption } from '../../shared/components/select/select.component';

/** Labels lindos para los roles semilla — cualquier otro (custom) muestra su propio nombre tal cual. */
const SEED_ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: 'Dueño de cuenta',
  MANAGER:    'Gerente',
  KITCHEN:    'Cocina',
  READONLY:   'Solo lectura',
};

const SEED_ROLE_BADGE: Record<string, string> = {
  SUPERADMIN: 'badge-owner',
  MANAGER:    'badge-manager',
  KITCHEN:    'badge-kitchen',
  READONLY:   'badge-neutral',
};

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ActionDialogComponent, DrawerComponent, SpinnerComponent, SelectComponent],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss'
})
export class UsersComponent implements OnInit {
  users   = signal<UserResponse[]>([]);
  loading = signal(true);
  error   = signal<string | null>(null);

  roles = signal<RoleResponse[]>([]);
  /** No se puede asignar el rol de sistema (dueño de cuenta) desde acá — es único, automático. */
  roleOptions = computed<SelectOption[]>(() =>
    this.roles().filter(r => !r.isSystem).map(r => ({ value: r.id ?? '', label: this.roleLabel(r.name) })));

  drawerOpen        = signal(false);
  editing           = signal<UserResponse | null>(null);
  saving            = signal(false);
  saveError         = signal<string | null>(null);

  deactivating      = signal<UserResponse | null>(null);
  deactivateLoading = signal(false);

  // Permisos (solo OWNER, solo editando un usuario existente)
  readonly permissionModules = PERMISSION_MODULES;
  permissionsLoading = signal(false);
  permissionsSaving  = signal(false);
  permissionsError   = signal<string | null>(null);
  roleDefaults       = signal<Set<string>>(new Set());
  effectivePerms     = signal<Set<string>>(new Set());

  form: FormGroup;

  constructor(private api: Api, private fb: FormBuilder, public authService: AuthService) {
    this.form = this.fb.group({
      name:   ['', Validators.required],
      email:  ['', [Validators.required, Validators.email]],
      roleId: ['', Validators.required],
      phone:  ['', Validators.required],
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.load(), this.loadRoles()]);
  }

  async load(): Promise<void> {
    if (this.users().length === 0) this.loading.set(true); // evita el flash de spinner (y el salto de scroll) en recargas tras crear/editar/borrar
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

  async loadRoles(): Promise<void> {
    try {
      const raw = await this.api.invoke(listRoles) as unknown;
      this.roles.set(await parseBlob<RoleResponse[]>(raw));
    } catch { /* non-critical — el dropdown queda vacío */ }
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '', email: '', roleId: '', phone: '' });
    this.form.get('email')?.enable();
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(u: UserResponse): void {
    this.editing.set(u);
    this.form.reset({ name: u.name ?? '', email: u.email ?? '', roleId: u.roleId ?? '', phone: u.phone ?? '' });
    this.form.get('email')?.disable();
    this.saveError.set(null);
    this.drawerOpen.set(true);
    this.permissionsError.set(null);
    if (this.authService.hasPermission('ROLES_VIEW') && u.id && !u.roleIsSystem) void this.loadPermissions(u.id);
  }

  // ── Permisos ─────────────────────────────────────────────────

  async loadPermissions(userId: string): Promise<void> {
    this.permissionsLoading.set(true);
    this.permissionsError.set(null);
    try {
      const raw = await this.api.invoke(getPermissions, { id: userId }) as unknown;
      const res = await parseBlob<UserPermissionsResponse>(raw);
      this.roleDefaults.set(new Set(res.roleDefaults ?? []));
      this.effectivePerms.set(new Set(res.effective ?? []));
    } catch {
      this.permissionsError.set('No se pudieron cargar los permisos.');
    } finally {
      this.permissionsLoading.set(false);
    }
  }

  hasEffectivePermission(perm?: PermissionKey): boolean {
    return !!perm && this.effectivePerms().has(perm);
  }

  /** true si el checkbox difiere del default del rol — así se ve de un vistazo qué es una excepción puntual. */
  isOverridden(perm?: PermissionKey): boolean {
    if (!perm) return false;
    return this.effectivePerms().has(perm) !== this.roleDefaults().has(perm);
  }

  togglePermission(perm?: PermissionKey): void {
    if (!perm) return;
    const next = new Set(this.effectivePerms());
    next.has(perm) ? next.delete(perm) : next.add(perm);
    this.effectivePerms.set(next);
  }

  async savePermissions(): Promise<void> {
    const u = this.editing();
    if (!u?.id) return;
    this.permissionsSaving.set(true);
    this.permissionsError.set(null);
    try {
      // Solo mandamos las excepciones al default del rol — no todo el catálogo.
      const overrides: OverrideItem[] = [];
      for (const perm of allPermissionKeys()) {
        const effective = this.effectivePerms().has(perm);
        if (effective !== this.roleDefaults().has(perm)) {
          overrides.push({ permission: perm, granted: effective });
        }
      }
      const raw = await this.api.invoke(setPermissions, { id: u.id, body: { overrides } }) as unknown;
      const res = await parseBlob<UserPermissionsResponse>(raw);
      this.roleDefaults.set(new Set(res.roleDefaults ?? []));
      this.effectivePerms.set(new Set(res.effective ?? []));
    } catch (e: any) {
      this.permissionsError.set(extractApiError(e, 'Error al guardar los permisos'));
    } finally {
      this.permissionsSaving.set(false);
    }
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
        const body = { name: v.name, roleId: v.roleId, phone: v.phone.trim() };
        await this.api.invoke(updateUser, { id: u.id, body });
      } else {
        const body = { name: v.name, email: v.email, roleId: v.roleId, phone: v.phone.trim() };
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

  isInvalid = (field: string) => isFormFieldInvalid(this.form, field);

  roleLabel(r?: string): string {
    return r ? (SEED_ROLE_LABELS[r] ?? r) : '—';
  }

  roleClass(r?: string): string {
    return r ? (SEED_ROLE_BADGE[r] ?? 'badge-neutral') : 'badge-neutral';
  }

  readonly formatDate = formatDate;
}
