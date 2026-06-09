import { Component, HostListener, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api } from '../../api/api';
import { listSuppliers } from '../../api/fn/supplier-controller/list-suppliers';
import { createSupplier } from '../../api/fn/supplier-controller/create-supplier';
import { updateSupplier } from '../../api/fn/supplier-controller/update-supplier';
import { deactivateSupplier } from '../../api/fn/supplier-controller/deactivate-supplier';
import { SupplierResponse } from '../../api/models/supplier-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { extractApiError } from '../../core/utils/api-error';
import { ActionDialogComponent } from '../../shared/components/action-dialog/action-dialog.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';
import { isFormFieldInvalid } from '../../core/utils/form';

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [ReactiveFormsModule, ActionDialogComponent, DrawerComponent, SpinnerComponent],
  templateUrl: './suppliers.component.html',
  styleUrl: './suppliers.component.scss'
})
export class SuppliersComponent implements OnInit {
  suppliers  = signal<SupplierResponse[]>([]);
  loading    = signal(true);
  error      = signal<string | null>(null);

  drawerOpen      = signal(false);
  editing         = signal<SupplierResponse | null>(null);
  saving          = signal(false);
  saveError       = signal<string | null>(null);

  deactivating      = signal<SupplierResponse | null>(null);
  deactivateLoading = signal(false);

  form: FormGroup;

  constructor(private api: Api, private fb: FormBuilder) {
    this.form = this.fb.group({
      name:    ['', Validators.required],
      email:   [''],
      phone:   [''],
      address: [''],
      notes:   [''],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.invoke(listSuppliers) as unknown;
      this.suppliers.set(await parseBlob<SupplierResponse[]>(raw));
    } catch {
      this.error.set('No se pudieron cargar los proveedores.');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '', email: '', phone: '', address: '', notes: '' });
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(s: SupplierResponse): void {
    this.editing.set(s);
    this.form.reset({
      name:    s.name    ?? '',
      email:   s.email   ?? '',
      phone:   s.phone   ?? '',
      address: s.address ?? '',
      notes:   s.notes   ?? '',
    });
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
    const body = {
      name:    v.name,
      ...(v.email?.trim()   ? { email:   v.email.trim()   } : {}),
      ...(v.phone?.trim()   ? { phone:   v.phone.trim()   } : {}),
      ...(v.address?.trim() ? { address: v.address.trim() } : {}),
      ...(v.notes?.trim()   ? { notes:   v.notes.trim()   } : {}),
    };
    try {
      const s = this.editing();
      if (s?.id) {
        await this.api.invoke(updateSupplier, { id: s.id, body });
      } else {
        await this.api.invoke(createSupplier, { body });
      }
      this.drawerOpen.set(false);
      await this.load();
    } catch (e: any) {
      this.saveError.set(extractApiError(e, 'Error al guardar el proveedor'));
    } finally {
      this.saving.set(false);
    }
  }

  async confirmDeactivate(): Promise<void> {
    const s = this.deactivating();
    if (!s?.id) return;
    this.deactivateLoading.set(true);
    try {
      await this.api.invoke(deactivateSupplier, { id: s.id });
      this.deactivating.set(null);
      await this.load();
    } catch { /* stays in dialog */ }
    finally {
      this.deactivateLoading.set(false);
    }
  }

  isInvalid = (field: string) => isFormFieldInvalid(this.form, field);
}
