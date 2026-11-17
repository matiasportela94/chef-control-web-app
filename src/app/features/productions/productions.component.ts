import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../api/api';
import { listProducts } from '../../api/fn/product-controller/list-products';
import { listUnits } from '../../api/fn/unit-controller/list-units';
import { PagedResponseProductResponse } from '../../api/models/paged-response-product-response';
import { UnitResponse } from '../../api/models/unit-response';
import {
  PagedResponseProductionResponse, ProductWithPreparation, ProductionResponse,
  getProduction, listProductions, recordProduction, reverseProduction,
} from '../../core/api-pending/preparations';
import { AlertNotificationService } from '../../core/services/alert-notification.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { extractApiError } from '../../core/utils/api-error';
import { arDayStart, arToday } from '../../core/utils/date';
import { isFormFieldInvalid } from '../../core/utils/form';
import { formatARS, formatDateOnly, formatDatetime, formatNum } from '../../core/utils/format';
import { parseBlob } from '../../core/utils/parse-blob';
import { ActionDialogComponent } from '../../shared/components/action-dialog/action-dialog.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { SelectComponent, SelectOption } from '../../shared/components/select/select.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';

type AutomaticFilter = 'all' | 'manual' | 'automatic';

/**
 * Producción de preparaciones (F17): "hice 5 kg de mayonesa base". Registrar descuenta los ingredientes de la receta de
 * la preparación y suma su stock con ese costo; el back lo hace todo. Acá se registra, se lista, se mira el detalle y se
 * revierte.
 */
@Component({
  selector: 'app-productions',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PaginatorComponent, DrawerComponent, SpinnerComponent, SelectComponent, ActionDialogComponent],
  templateUrl: './productions.component.html',
  styleUrl: './productions.component.scss'
})
export class ProductionsComponent implements OnInit {
  productions = signal<ProductionResponse[]>([]);
  loading = signal(true);
  error   = signal<string | null>(null);
  page    = signal(1);
  readonly pageSize = 20;
  total   = signal(0);
  automaticFilter = signal<AutomaticFilter>('all');

  preparations = signal<ProductWithPreparation[]>([]);
  units        = signal<UnitResponse[]>([]);
  preparationOptions = computed<SelectOption[]>(() => this.preparations().map(p => ({ value: p.id ?? '', label: p.name ?? '' })));
  /** Las unidades del mismo tipo que la de la preparación (kg → g, kg); el back convierte. */
  unitOptions = signal<SelectOption[]>([]);

  /** Recetas y food cost: sin la feature el back rechaza todo, así que ni se pide. */
  get locked(): boolean { return !this.auth.hasFeature('RECIPES_AND_FOOD_COST'); }
  get canCreate(): boolean { return this.auth.hasPermission('PRODUCTIONS_CREATE'); }
  get canReverse(): boolean { return this.auth.hasPermission('PRODUCTIONS_DELETE'); }
  get canSeePlans(): boolean { return this.auth.hasPermission('ACCOUNT_VIEW'); }

  formOpen  = signal(false);
  saving    = signal(false);
  saveError = signal<string | null>(null);
  form: FormGroup;

  detail        = signal<ProductionResponse | null>(null);
  detailLoading = signal(false);
  detailError   = signal<string | null>(null);
  reversing     = signal(false);
  reverseOpen   = signal(false);
  reverseError  = signal<string | null>(null);

  constructor(private api: Api, private fb: FormBuilder, private auth: AuthService, private i18n: I18nService,
              private alertNotification: AlertNotificationService) {
    this.form = this.fb.group({
      productId:      ['', Validators.required],
      quantity:       [null as number | null, [Validators.required, Validators.min(0.001)]],
      unitId:         ['', Validators.required],
      expirationDate: [''],
      producedAt:     [arToday(), Validators.required],
      notes:          [''],
    });
  }

  async ngOnInit(): Promise<void> {
    if (this.locked) { this.loading.set(false); return; }
    await Promise.all([this.load(), this.loadFormData()]);
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  async load(): Promise<void> {
    if (!this.productions().length) this.loading.set(true);
    this.error.set(null);
    const f = this.automaticFilter();
    try {
      const raw = await this.api.invoke(listProductions, {
        page: this.page() - 1, size: this.pageSize, ...(f === 'all' ? {} : { automatic: f === 'automatic' }),
      }) as unknown;
      const res = await parseBlob<PagedResponseProductionResponse>(raw);
      this.productions.set(res.content ?? []);
      this.total.set(res.totalElements ?? 0);
    } catch {
      this.error.set(this.t('productions.loadError'));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadFormData(): Promise<void> {
    try {
      const [prodsRaw, unitsRaw] = await Promise.all([
        this.api.invoke(listProducts, { page: 0, size: 999 }) as unknown,
        this.api.invoke(listUnits) as unknown,
      ]);
      const products = (await parseBlob<PagedResponseProductResponse>(prodsRaw)).content ?? [];
      this.preparations.set((products as ProductWithPreparation[]).filter(p => p.preparation && p.isActive));
      this.units.set(await parseBlob<UnitResponse[]>(unitsRaw));
    } catch { /* el form queda sin opciones; el listado igual se ve */ }
  }

  setFilter(f: AutomaticFilter): void {
    if (f === this.automaticFilter()) return;
    this.automaticFilter.set(f);
    this.page.set(1);
    void this.load();
  }

  async goToPage(p: number): Promise<void> {
    this.page.set(p);
    await this.load();
  }

  // ---- registrar

  openForm(): void {
    this.form.reset({ productId: '', quantity: null, unitId: '', expirationDate: '', producedAt: arToday(), notes: '' });
    this.unitOptions.set([]);
    this.saveError.set(null);
    this.formOpen.set(true);
  }

  onPreparationChange(): void {
    const prep = this.preparations().find(p => p.id === this.form.get('productId')?.value);
    const unitType = this.units().find(u => u.id === prep?.defaultUnit?.id)?.type;
    const units = unitType ? this.units().filter(u => u.type === unitType) : this.units();
    this.unitOptions.set(units.map(u => ({ value: u.id ?? '', label: `${u.abbreviation} — ${u.name}` })));
    this.form.get('unitId')?.setValue(prep?.defaultUnit?.id ?? '');
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveError.set(null);
    const v = this.form.getRawValue();
    try {
      await this.api.invoke(recordProduction, { body: {
        productId: v.productId, quantity: +v.quantity, unitId: v.unitId,
        ...(v.expirationDate ? { expirationDate: v.expirationDate } : {}),
        // Hoy: la hora real la pone el back. Otro día: medianoche argentina de ese día, no UTC.
        ...(v.producedAt && v.producedAt !== arToday() ? { producedAt: arDayStart(v.producedAt) } : {}),
        ...(v.notes?.trim() ? { notes: v.notes.trim() } : {}),
      } });
      this.formOpen.set(false);
      await this.load();
      void this.alertNotification.refresh();
    } catch (e) {
      this.saveError.set(extractApiError(e, this.t('productions.saveError')));
    } finally {
      this.saving.set(false);
    }
  }

  isInvalid = (field: string) => isFormFieldInvalid(this.form, field);

  // ---- detalle y reversión

  async openDetail(p: ProductionResponse): Promise<void> {
    this.detail.set(p);
    this.detailError.set(null);
    this.detailLoading.set(true);
    try {
      this.detail.set(await parseBlob<ProductionResponse>(await this.api.invoke(getProduction, { id: p.id! }) as unknown));
    } catch (e) {
      this.detailError.set(extractApiError(e, this.t('productions.detailError')));
    } finally {
      this.detailLoading.set(false);
    }
  }

  closeDetail(): void {
    this.detail.set(null);
  }

  openReverse(): void {
    this.reverseError.set(null);
    this.reverseOpen.set(true);
  }

  async confirmReverse(): Promise<void> {
    const p = this.detail();
    if (!p?.id) return;
    this.reversing.set(true);
    this.reverseError.set(null);
    try {
      await this.api.invoke(reverseProduction, { id: p.id });
      this.reverseOpen.set(false);
      await Promise.all([this.openDetail(p), this.load()]);
      void this.alertNotification.refresh();
    } catch (e) {
      this.reverseError.set(extractApiError(e, this.t('productions.reverseError')));
    } finally {
      this.reversing.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.reverseOpen()) return;  // lo cierra el diálogo
    if (this.formOpen()) this.formOpen.set(false);
    else if (this.detail()) this.closeDetail();
  }

  origin(p: ProductionResponse): string | null {
    if (!p.automatic) return null;
    if (p.saleId) return this.t('productions.fromSale');
    if (p.parentProductionId) return this.t('productions.fromProduction');
    return this.t('productions.automaticHint');
  }

  qty(n?: number, unit?: string): string {
    return `${formatNum(n)} ${unit ?? ''}`.trim();
  }

  readonly formatARS = formatARS;
  readonly formatDatetime = formatDatetime;
  readonly formatDateOnly = formatDateOnly;
}
