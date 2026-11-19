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
import { I18nService } from '../../core/services/i18n.service';
import { IVA_RATES, formatIvaRate } from '../../core/utils/iva';
import { SelectComponent, SelectOption } from '../../shared/components/select/select.component';

type TaxCondition = NonNullable<RestaurantResponse['taxCondition']>;

@Component({
  selector: 'app-restaurants',
  standalone: true,
  imports: [ReactiveFormsModule, ActionDialogComponent, DrawerComponent, SpinnerComponent, SelectComponent],
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

  readonly taxConditions: TaxCondition[] = ['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO'];

  constructor(private api: Api, private fb: FormBuilder, public auth: AuthService, private i18n: I18nService) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      timezone: [''],
      // Una vez definida no vuelve a "sin definir": el back toma null como "no cambiar".
      taxCondition: [null as TaxCondition | null],
      // Alícuota con la que factura sus ventas (solo cuenta en RI). El back nunca la devuelve en null: default 21.
      salesIvaPercentage: ['21'],
    });
  }

  readonly salesIvaOptions: SelectOption[] = IVA_RATES.map(r => ({ value: String(r), label: formatIvaRate(r) }));

  get isRiSelected(): boolean {
    return this.form.get('taxCondition')?.value === 'RESPONSABLE_INSCRIPTO';
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  taxLabel(condition: TaxCondition | null | undefined): string {
    return this.t(condition ? `restaurants.tax.${condition}` : 'restaurants.taxNotSet');
  }

  setTaxCondition(condition: TaxCondition): void {
    this.form.get('taxCondition')?.setValue(condition);
  }

  /** Pasar a RI baja el food cost de las compras nuevas: se avisa antes de guardar, para que no parezca un error. */
  get switchingToRi(): boolean {
    const r = this.editing();
    return !!r && r.taxCondition !== 'RESPONSABLE_INSCRIPTO'
      && this.form.get('taxCondition')?.value === 'RESPONSABLE_INSCRIPTO';
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
      this.error.set(this.t('restaurants.loadError'));
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '', timezone: '', taxCondition: null, salesIvaPercentage: '21' });
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(r: RestaurantResponse): void {
    this.editing.set(r);
    this.form.reset({ name: r.name ?? '', timezone: r.timezone ?? '', taxCondition: r.taxCondition ?? null,
                      salesIvaPercentage: String(r.salesIvaPercentage ?? 21) });
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
    const body = {
      name: raw.name.trim(),
      timezone: raw.timezone?.trim() || undefined,
      taxCondition: raw.taxCondition ?? undefined,
      // Solo se manda en RI: en Monotributo no se usa (en el POST, sin el campo el back pone 21; en el PUT, no cambia).
      ...(raw.taxCondition === 'RESPONSABLE_INSCRIPTO' ? { salesIvaPercentage: +raw.salesIvaPercentage } : {}),
    };
    try {
      const r = this.editing();
      if (r?.id) {
        await this.api.invoke(updateRestaurant, { id: r.id, body });
      } else {
        await this.api.invoke(createRestaurant, { body });
      }
      this.drawerOpen.set(false);
      // La sesión guarda los locales (el selector de la barra) y la condición fiscal del activo (el default de
      // "precios con IVA" en compras): sin esto quedarían viejos hasta el próximo login.
      await this.auth.refreshSession().catch(() => undefined);
      await this.load();
    } catch (e: any) {
      this.saveError.set(extractApiError(e, this.t('restaurants.saveError')));
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
      await this.auth.refreshSession().catch(() => undefined);  // el selector de la barra
      await this.load();
    } catch (e: any) {
      this.error.set(extractApiError(e, this.t('restaurants.toggleError')));
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
      await this.auth.refreshSession().catch(() => undefined);  // el selector de la barra
      this.closeDelete();
      await this.load();
    } catch (e: any) {
      this.deleteError.set(extractApiError(e, this.t('restaurants.deleteError')));
    } finally {
      this.deleteLoading.set(false);
    }
  }

  isInvalid = (field: string) => isFormFieldInvalid(this.form, field);
}
