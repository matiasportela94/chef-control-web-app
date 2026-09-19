import { Component, HostListener, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api } from '../../api/api';
import { AuthService } from '../../core/services/auth.service';
import { listUsers } from '../../api/fn/user-controller/list-users';
import { createUser } from '../../api/fn/user-controller/create-user';
import { updateUser } from '../../api/fn/user-controller/update-user';
import { deactivateUser } from '../../api/fn/user-controller/deactivate-user';
import { getPermissions } from '../../api/fn/user-controller/get-permissions';
import { setPermissions } from '../../api/fn/user-controller/set-permissions';
import { UserResponse } from '../../api/models/user-response';
import { UserPermissionsResponse } from '../../api/models/user-permissions-response';
import { OverrideItem } from '../../api/models/override-item';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatDate } from '../../core/utils/format';
import { extractApiError } from '../../core/utils/api-error';
import { ActionDialogComponent } from '../../shared/components/action-dialog/action-dialog.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';
import { isFormFieldInvalid } from '../../core/utils/form';
import { SelectComponent } from '../../shared/components/select/select.component';

type Role = 'OWNER' | 'MANAGER' | 'KITCHEN' | 'READONLY';
type PermissionKey = OverrideItem['permission'];

interface PermissionModule {
  label: string;
  view?: PermissionKey;
  manage?: PermissionKey;
}

/** Mismo catálogo que el backend (domain/user/Permission.java) — agrupado por módulo para la UI. */
const PERMISSION_MODULES: PermissionModule[] = [
  { label: 'Insumos',       view: 'PRODUCTS_VIEW',      manage: 'PRODUCTS_MANAGE' },
  { label: 'Categorías',    view: 'CATEGORIES_VIEW',    manage: 'CATEGORIES_MANAGE' },
  { label: 'Proveedores',   view: 'SUPPLIERS_VIEW',     manage: 'SUPPLIERS_MANAGE' },
  { label: 'Compras',       view: 'PURCHASES_VIEW',     manage: 'PURCHASES_MANAGE' },
  { label: 'Ventas',        view: 'SALES_VIEW',         manage: 'SALES_MANAGE' },
  { label: 'Merma',         view: 'WASTE_VIEW',         manage: 'WASTE_MANAGE' },
  { label: 'Stock',         view: 'STOCK_VIEW',         manage: 'STOCK_MANAGE' },
  { label: 'Conteos',       view: 'STOCK_COUNTS_VIEW',  manage: 'STOCK_COUNTS_MANAGE' },
  { label: 'Menú',          view: 'MENU_VIEW',          manage: 'MENU_MANAGE' },
  { label: 'Food Cost',     view: 'FOOD_COST_VIEW' },
  { label: 'Alertas',       view: 'ALERTS_VIEW',        manage: 'ALERTS_MANAGE' },
  { label: 'Usuarios',      view: 'USERS_VIEW',         manage: 'USERS_MANAGE' },
  { label: 'Auditoría',     view: 'AUDIT_VIEW' },
  { label: 'Entrada rápida (IA)', manage: 'AI_USE' },
];

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [ReactiveFormsModule, ActionDialogComponent, DrawerComponent, SpinnerComponent, SelectComponent],
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

  // Permisos (solo OWNER, solo editando un usuario existente)
  readonly permissionModules = PERMISSION_MODULES;
  permissionsLoading = signal(false);
  permissionsSaving  = signal(false);
  permissionsError   = signal<string | null>(null);
  roleDefaults       = signal<Set<string>>(new Set());
  effectivePerms     = signal<Set<string>>(new Set());

  readonly roles: { value: Role; label: string }[] = [
    { value: 'OWNER',    label: 'Propietario'   },
    { value: 'MANAGER',  label: 'Gerente'        },
    { value: 'KITCHEN',  label: 'Cocina'         },
    { value: 'READONLY', label: 'Solo lectura'   },
  ];

  form: FormGroup;

  constructor(private api: Api, private fb: FormBuilder, public authService: AuthService) {
    this.form = this.fb.group({
      name:  ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      role:  ['KITCHEN', Validators.required],
      phone: ['', Validators.required],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
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
    this.permissionsError.set(null);
    if (this.authService.isOwner && u.id) void this.loadPermissions(u.id);
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
      for (const perm of this.allPermissionKeys()) {
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

  private allPermissionKeys(): PermissionKey[] {
    return this.permissionModules.flatMap(m => [m.view, m.manage].filter((p): p is PermissionKey => !!p));
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
          phone: v.phone.trim(),
        };
        await this.api.invoke(updateUser, { id: u.id, body });
      } else {
        const body = {
          name:  v.name,
          email: v.email,
          role:  v.role as Role,
          phone: v.phone.trim(),
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

  isInvalid = (field: string) => isFormFieldInvalid(this.form, field);

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
