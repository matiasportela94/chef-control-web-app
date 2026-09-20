import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api } from '../../api/api';
import { listRestaurants } from '../../api/fn/restaurant-controller/list-restaurants';
import { createRestaurant } from '../../api/fn/restaurant-controller/create-restaurant';
import { updateRestaurant } from '../../api/fn/restaurant-controller/update-restaurant';
import { setRestaurantActive } from '../../api/fn/restaurant-controller/set-restaurant-active';
import { deleteRestaurant } from '../../api/fn/restaurant-controller/delete-restaurant';
import { RestaurantResponse } from '../../api/models/restaurant-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { extractApiError } from '../../core/utils/api-error';
import { AuthService } from '../../core/services/auth.service';
import { ActionDialogComponent } from '../../shared/components/action-dialog/action-dialog.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';
import { isFormFieldInvalid } from '../../core/utils/form';

@Component({
  selector: 'app-restaurants',
  standalone: true,
  imports: [ReactiveFormsModule, ActionDialogComponent, DrawerComponent, SpinnerComponent],
  templateUrl: './restaurants.component.html',
  styleUrl: './restaurants.component.scss'
})
export class RestaurantsComponent implements OnInit {
  restaurants = signal<RestaurantResponse[]>([]);
  loading     = signal(true);
  error       = signal<string | null>(null);
  rowBusy     = signal<string | null>(null);

  drawerOpen = signal(false);
  editing    = signal<RestaurantResponse | null>(null);
  saving     = signal(false);
  saveError  = signal<string | null>(null);

  deleting      = signal<RestaurantResponse | null>(null);
  deleteConfirm = signal('');
  deleteLoading = signal(false);
  deleteError   = signal<string | null>(null);

  /** El nombre tipeado tiene que coincidir exacto — el borrado se lleva toda la data del local. */
  deleteBlocked = computed(() =>
    this.deleteLoading() || this.deleteConfirm().trim() !== (this.deleting()?.name ?? ''));

  form: FormGroup;

  constructor(private api: Api, private fb: FormBuilder, public auth: AuthService) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      timezone: [''],
    });
  }

  get canCreate(): boolean { return this.auth.hasPermission('RESTAURANTS_CREATE'); }
  get canUpdate(): boolean { return this.auth.hasPermission('RESTAURANTS_UPDATE'); }
  get canDelete(): boolean { return this.auth.hasPermission('RESTAURANTS_DELETE'); }

  isCurrent(r: RestaurantResponse): boolean {
    return r.id === this.auth.currentUser()?.restaurantId;
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    if (this.restaurants().length === 0) this.loading.set(true); // sin flash de spinner en recargas: no salta el scroll
    this.error.set(null);
    try {
      const raw = await this.api.invoke(listRestaurants) as unknown;
      this.restaurants.set(await parseBlob<RestaurantResponse[]>(raw));
    } catch {
      this.error.set('No se pudieron cargar los restaurantes.');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '', timezone: '' });
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(r: RestaurantResponse): void {
    this.editing.set(r);
    this.form.reset({ name: r.name ?? '', timezone: r.timezone ?? '' });
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void { this.drawerOpen.set(false); }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.drawerOpen()) this.closeDrawer();
    if (this.deleting()) this.closeDelete();
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveError.set(null);
    const raw = this.form.getRawValue();
    const body = { name: raw.name.trim(), timezone: raw.timezone?.trim() || undefined };
    try {
      const r = this.editing();
      if (r?.id) {
        await this.api.invoke(updateRestaurant, { id: r.id, body });
      } else {
        await this.api.invoke(createRestaurant, { body });
      }
      this.drawerOpen.set(false);
      await this.load();
    } catch (e: any) {
      this.saveError.set(extractApiError(e, 'Error al guardar el restaurante'));
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(r: RestaurantResponse): Promise<void> {
    if (!r.id) return;
    this.rowBusy.set(r.id);
    this.error.set(null);
    try {
      await this.api.invoke(setRestaurantActive, { id: r.id, body: { active: !r.isActive } });
      await this.load();
    } catch (e: any) {
      this.error.set(extractApiError(e, 'No se pudo cambiar el estado del restaurante'));
    } finally {
      this.rowBusy.set(null);
    }
  }

  openDelete(r: RestaurantResponse): void {
    this.deleting.set(r);
    this.deleteConfirm.set('');
    this.deleteError.set(null);
  }

  closeDelete(): void {
    this.deleting.set(null);
    this.deleteConfirm.set('');
  }

  async confirmDelete(): Promise<void> {
    const r = this.deleting();
    if (!r?.id || this.deleteBlocked()) return;
    this.deleteLoading.set(true);
    this.deleteError.set(null);
    try {
      await this.api.invoke(deleteRestaurant, { id: r.id });
      this.closeDelete();
      await this.load();
    } catch (e: any) {
      this.deleteError.set(extractApiError(e, 'Error al eliminar el restaurante'));
    } finally {
      this.deleteLoading.set(false);
    }
  }

  isInvalid = (field: string) => isFormFieldInvalid(this.form, field);
}
