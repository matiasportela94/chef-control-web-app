import { Component, HostListener, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api } from '../../api/api';
import { listRoles } from '../../api/fn/role-controller/list-roles';
import { createRole } from '../../api/fn/role-controller/create-role';
import { updateRole } from '../../api/fn/role-controller/update-role';
import { deleteRole } from '../../api/fn/role-controller/delete-role';
import { RoleResponse } from '../../api/models/role-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { extractApiError } from '../../core/utils/api-error';
import { PermissionKey, PERMISSION_MODULES } from '../../core/utils/permission-catalog';
import { ActionDialogComponent } from '../../shared/components/action-dialog/action-dialog.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';
import { isFormFieldInvalid } from '../../core/utils/form';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [ReactiveFormsModule, ActionDialogComponent, DrawerComponent, SpinnerComponent],
  templateUrl: './roles.component.html',
  styleUrl: './roles.component.scss'
})
export class RolesComponent implements OnInit {
  roles   = signal<RoleResponse[]>([]);
  loading = signal(true);
  error   = signal<string | null>(null);

  readonly permissionModules = PERMISSION_MODULES;

  drawerOpen = signal(false);
  editing    = signal<RoleResponse | null>(null);
  selected   = signal<Set<PermissionKey>>(new Set());
  saving     = signal(false);
  saveError  = signal<string | null>(null);

  deleting      = signal<RoleResponse | null>(null);
  deleteLoading = signal(false);
  deleteError   = signal<string | null>(null);

  form: FormGroup;

  constructor(private api: Api, private fb: FormBuilder) {
    this.form = this.fb.group({
      name: ['', Validators.required],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    if (this.roles().length === 0) this.loading.set(true); // evita el flash de spinner (y el salto de scroll) en recargas tras crear/editar/borrar
    this.error.set(null);
    try {
      const raw = await this.api.invoke(listRoles) as unknown;
      this.roles.set(await parseBlob<RoleResponse[]>(raw));
    } catch {
      this.error.set('No se pudieron cargar los roles.');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '' });
    this.selected.set(new Set());
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(r: RoleResponse): void {
    if (r.isSystem) return;
    this.editing.set(r);
    this.form.reset({ name: r.name ?? '' });
    this.selected.set(new Set((r.permissions ?? []) as PermissionKey[]));
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.drawerOpen()) this.closeDrawer();
    if (this.deleting()) this.deleting.set(null);
  }

  isChecked(perm?: PermissionKey): boolean {
    return !!perm && this.selected().has(perm);
  }

  toggle(perm?: PermissionKey): void {
    if (!perm) return;
    const next = new Set(this.selected());
    next.has(perm) ? next.delete(perm) : next.add(perm);
    this.selected.set(next);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveError.set(null);
    const name = this.form.getRawValue().name.trim();
    const permissions = [...this.selected()];
    try {
      const r = this.editing();
      if (r?.id) {
        await this.api.invoke(updateRole, { id: r.id, body: { name, permissions } });
      } else {
        await this.api.invoke(createRole, { body: { name, permissions } });
      }
      this.drawerOpen.set(false);
      await this.load();
    } catch (e: any) {
      this.saveError.set(extractApiError(e, 'Error al guardar el rol'));
    } finally {
      this.saving.set(false);
    }
  }

  async confirmDelete(): Promise<void> {
    const r = this.deleting();
    if (!r?.id) return;
    this.deleteLoading.set(true);
    this.deleteError.set(null);
    try {
      await this.api.invoke(deleteRole, { id: r.id });
      this.deleting.set(null);
      await this.load();
    } catch (e: any) {
      this.deleteError.set(extractApiError(e, 'Error al eliminar el rol'));
    } finally {
      this.deleteLoading.set(false);
    }
  }

  isInvalid = (field: string) => isFormFieldInvalid(this.form, field);
}
