import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Api } from '../../api/api';
import { listProducts } from '../../api/fn/product-controller/list-products';
import { getProductCostEvolution } from '../../api/fn/product-controller/get-product-cost-evolution';
import { ProductCostEvolutionResponse } from '../../api/models/product-cost-evolution-response';
import { createProduct } from '../../api/fn/product-controller/create-product';
import { updateProduct } from '../../api/fn/product-controller/update-product';
import { deactivateProduct } from '../../api/fn/product-controller/deactivate-product';
import { listUnits } from '../../api/fn/unit-controller/list-units';
import { listCategories } from '../../api/fn/product-category-controller/list-categories';
import { ProductResponse } from '../../api/models/product-response';
import { UnitResponse } from '../../api/models/unit-response';
import { CategoryResponse } from '../../api/models/category-response';
import { PagedResponseProductResponse } from '../../api/models/paged-response-product-response';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { ActionDialogComponent } from '../../shared/components/action-dialog/action-dialog.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { ChartSeries, StepLineChartComponent } from '../../shared/components/step-line-chart/step-line-chart.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';
import { SearchFilterBarComponent, FilterBarState } from '../../shared/components/search-filter-bar/search-filter-bar.component';
import { SelectComponent, SelectOption } from '../../shared/components/select/select.component';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatDateOnly } from '../../core/utils/format';
import { todayISO, firstOfMonth } from '../../core/utils/date';
import { I18nService } from '../../core/services/i18n.service';
import { extractApiError } from '../../core/utils/api-error';
import { isFormFieldInvalid } from '../../core/utils/form';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, DecimalPipe, PaginatorComponent, ActionDialogComponent, DrawerComponent, SpinnerComponent, SearchFilterBarComponent, SelectComponent, StepLineChartComponent],
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss'
})
export class ProductsComponent implements OnInit {
  products = signal<ProductResponse[]>([]);
  loading  = signal(true);
  error    = signal<string | null>(null);
  page     = signal(1);
  readonly pageSize = 20;

  filterSearch     = signal('');
  filterCategoryId = signal('');
  filterOnlyActive = signal(true);

  /** Ordenar por lo que se vence primero — los insumos sin fecha quedan al final. */
  sortByExpiration = signal(false);

  filteredProducts = computed(() => {
    const term       = this.filterSearch().toLowerCase().trim();
    const catId      = this.filterCategoryId();
    const onlyActive = this.filterOnlyActive();
    const list = this.products().filter(p => {
      if (onlyActive && !p.isActive) return false;
      if (catId && p.category?.id !== catId) return false;
      if (term) {
        return (p.name?.toLowerCase().includes(term) ?? false) ||
               (p.sku?.toLowerCase().includes(term)  ?? false);
      }
      return true;
    });

    if (!this.sortByExpiration()) return list;
    return [...list].sort((a, b) => {
      if (!a.nextExpirationDate) return b.nextExpirationDate ? 1 : 0;
      if (!b.nextExpirationDate) return -1;
      return a.nextExpirationDate.localeCompare(b.nextExpirationDate); // ISO: orden alfabetico = cronologico
    });
  });

  pagedProducts = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.filteredProducts().slice(start, start + this.pageSize);
  });

  isFiltered = computed(() =>
    this.filterSearch() !== '' || this.filterCategoryId() !== '' || !this.filterOnlyActive()
  );

  units        = signal<UnitResponse[]>([]);
  categories   = signal<CategoryResponse[]>([]);
  filterCategories = computed(() =>
    this.categories().map(c => ({ id: c.id ?? '', name: c.name ?? '' }))
  );
  unitOptions = computed<SelectOption[]>(() =>
    this.units().map(u => ({ value: u.id ?? '', label: `${u.name} (${u.abbreviation})` }))
  );
  categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map(c => ({ value: c.id ?? '', label: c.name ?? '' }))
  );

  drawerOpen     = signal(false);
  editingProduct = signal<ProductResponse | null>(null);
  saving         = signal(false);
  saveError      = signal<string | null>(null);

  deactivating      = signal<ProductResponse | null>(null);
  deactivateLoading = signal(false);

  form: FormGroup;

  constructor(
    private api: Api,
    private fb: FormBuilder,
    private i18n: I18nService
  ) {
    this.form = this.fb.group({
      name:          ['', Validators.required],
      sku:           [''],
      defaultUnitId: ['', Validators.required],
      categoryId:    [''],
      minStock:      [null as number | null],
      maxStock:      [null as number | null],
      yieldPercentage: [null as number | null],
      yieldLoss:       [null as number | null],
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadProducts(), this.loadFormData()]);
  }

  async loadProducts(): Promise<void> {
    if (this.products().length === 0) this.loading.set(true); // evita el flash de spinner (y el salto de scroll) en recargas tras crear/editar/borrar
    this.error.set(null);
    try {
      const raw = await this.api.invoke(listProducts, { page: 0, size: 999 }) as unknown;
      const res = await parseBlob<PagedResponseProductResponse>(raw);
      this.products.set(res.content ?? []);
    } catch {
      this.error.set('No se pudieron cargar los productos.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadFormData(): Promise<void> {
    try {
      const [unitsRaw, catsRaw] = await Promise.all([
        this.api.invoke(listUnits) as unknown,
        this.api.invoke(listCategories) as unknown,
      ]);
      this.units.set(await parseBlob<UnitResponse[]>(unitsRaw));
      this.categories.set(await parseBlob<CategoryResponse[]>(catsRaw));
    } catch { /* non-critical, form selects stay empty */ }
  }

  openCreate(): void {
    this.editingProduct.set(null);
    this.form.get('name')?.enable();
    this.form.reset({ name: '', sku: '', defaultUnitId: '', categoryId: '', minStock: null, maxStock: null,
                      yieldPercentage: null, yieldLoss: null });
    this.yieldMode.set('percent');
    this.advancedOpen.set(false);
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(p: ProductResponse): void {
    this.editingProduct.set(p);
    this.form.get('name')?.disable();
    this.form.patchValue({
      name:          p.name          ?? '',
      sku:           p.sku           ?? '',
      defaultUnitId: p.defaultUnit?.id ?? '',
      categoryId:    p.category?.id  ?? '',
      minStock:      p.minStock      ?? null,
      maxStock:      p.maxStock      ?? null,
      yieldPercentage: this.isDefaultYield(p.yieldPercentage) ? null : p.yieldPercentage!,
      yieldLoss:       null,
    });
    this.yieldMode.set('percent');
    this.syncLossFromPercent();
    // Si el insumo ya tiene rendimiento cargado, la sección no puede quedar escondida.
    this.advancedOpen.set(!this.isDefaultYield(p.yieldPercentage) || p.minStock != null || p.maxStock != null);
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.drawerOpen()) this.closeDrawer();
  }

  async saveProduct(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveError.set(null);
    const v = this.form.getRawValue();
    const body = {
      name:          v.name,
      defaultUnitId: v.defaultUnitId,
      ...(v.sku        ? { sku:        v.sku }        : {}),
      ...(v.categoryId ? { categoryId: v.categoryId } : {}),
      ...(v.minStock != null ? { minStock: +v.minStock } : {}),
      ...(v.maxStock != null ? { maxStock: +v.maxStock } : {}),
      // Siempre se guarda el porcentaje: dos representaciones del mismo dato en la base
      // serían dos fuentes de verdad. El modo "pierdo X por unidad" convierte al escribir.
      ...(v.yieldPercentage != null ? { yieldPercentage: +v.yieldPercentage } : {}),
    };
    try {
      const editing = this.editingProduct();
      if (editing?.id) {
        await this.api.invoke(updateProduct, { id: editing.id, body });
      } else {
        await this.api.invoke(createProduct, { body });
      }
      this.drawerOpen.set(false);
      await this.loadProducts();
    } catch (e: any) {
      this.saveError.set(extractApiError(e, 'Error al guardar el producto'));
    } finally {
      this.saving.set(false);
    }
  }

  async confirmDeactivate(): Promise<void> {
    const p = this.deactivating();
    if (!p?.id) return;
    this.deactivateLoading.set(true);
    try {
      await this.api.invoke(deactivateProduct, { id: p.id });
      this.deactivating.set(null);
      await this.loadProducts();
    } catch { /* error stays in dialog */ }
    finally {
      this.deactivateLoading.set(false);
    }
  }

  onFiltersChange(state: FilterBarState): void {
    this.filterSearch.set(state.search);
    this.filterCategoryId.set(state.categoryId);
    this.filterOnlyActive.set(state.onlyActive);
    this.page.set(1);
  }

  goToPage(p: number): void {
    this.page.set(p);
  }

  // ── Vencimiento más próximo ─────────────────────────────────

  /** Días hasta el vencimiento más próximo; negativo si ya venció, null si no hay fecha. */
  daysToExpiry(p: ProductResponse): number | null {
    if (!p.nextExpirationDate) return null;
    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const expiry = new Date(p.nextExpirationDate + 'T00:00:00');
    return Math.round((expiry.getTime() - today.getTime()) / 86400000);
  }

  expiryColor(p: ProductResponse): string {
    const d = this.daysToExpiry(p);
    if (d == null) return 'var(--text-3)';
    if (d <= 0)    return 'var(--red)';
    if (d <= 7)    return '#d97706';
    return 'var(--text-2)';
  }

  /** Texto corto al lado de la fecha: "vencido", "hoy", "3 d". */
  expiryHint(p: ProductResponse): string {
    const d = this.daysToExpiry(p);
    if (d == null)  return '';
    if (d < 0)      return this.t('products.expired');
    if (d === 0)    return this.t('products.expiresToday');
    return d + ' ' + this.t('products.daysShort');
  }

  toggleSortByExpiration(): void {
    this.sortByExpiration.update(v => !v);
    this.page.set(1);
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  readonly formatDateOnly = formatDateOnly;

  // ── Historial de costos ───────────────────────────────────────────────────
  // El costo de compra ya vivía completo en stock_movements desde el día uno; lo que faltaba
  // era una puerta para mirarlo. El rendimiento lo suma V22, y por eso solo esa mitad arranca
  // el 2026-09-21.

  costHistoryFor   = signal<ProductResponse | null>(null);
  costEvolution    = signal<ProductCostEvolutionResponse | null>(null);
  costLoading      = signal(false);
  costError        = signal<string | null>(null);
  costFrom         = signal(firstOfMonth());
  costTo           = signal(todayISO());

  costSeries = computed<ChartSeries[]>(() => {
    const points = this.costEvolution()?.points ?? [];
    // Las dos series comparten unidad y escala, así que van en un solo gráfico: la brecha
    // entre ellas es exactamente lo que cuesta la merma de limpieza. Escalas distintas
    // habrían necesitado dos gráficos, nunca dos ejes Y en el mismo.
    return [
      {
        label: this.t('products.purchaseCost'),
        color: 'var(--chart-1)',
        points: points.map(p => ({ at: p.at!, value: p.purchaseCost })),
      },
      {
        label: this.t('products.usableCost'),
        color: 'var(--chart-2)',
        points: points.map(p => ({ at: p.at!, value: p.usableCost })),
      },
    ];
  });

  costChartTitle = computed(() =>
    this.t('products.costChartTitle', { unit: this.costEvolution()?.unitAbbreviation ?? '' }));

  showsUnreliableYield = computed(() => {
    const reliableFrom = this.costEvolution()?.yieldReliableFrom;
    return !!reliableFrom && Date.parse(this.costFrom()) < Date.parse(reliableFrom);
  });

  yieldReliableFromLabel = computed(() => {
    const reliableFrom = this.costEvolution()?.yieldReliableFrom;
    return reliableFrom ? formatDateOnly(reliableFrom.substring(0, 10)) : '';
  });

  openCostHistory(product: ProductResponse): void {
    this.costHistoryFor.set(product);
    this.costEvolution.set(null);
    this.costError.set(null);
    void this.loadCostEvolution();
  }

  closeCostHistory(): void {
    this.costHistoryFor.set(null);
  }

  async loadCostEvolution(): Promise<void> {
    const product = this.costHistoryFor();
    if (!product?.id) return;
    this.costLoading.set(true);
    this.costError.set(null);
    try {
      const raw = await this.api.invoke(getProductCostEvolution, {
        id: product.id,
        from: `${this.costFrom()}T00:00:00Z`,
        to:   `${this.costTo()}T23:59:59Z`,
      }) as unknown;
      this.costEvolution.set(await parseBlob<ProductCostEvolutionResponse>(raw));
    } catch (e: any) {
      this.costEvolution.set(null);
      this.costError.set(extractApiError(e, 'No se pudo cargar el historial de costos.'));
    } finally {
      this.costLoading.set(false);
    }
  }

  isInvalid = (field: string) => isFormFieldInvalid(this.form, field);

  // ── Rendimiento ───────────────────────────────────────────────────────────
  // Se guarda siempre como porcentaje. El modo "pierdo X por unidad" existe porque es
  // como lo piensa la cocina ("pierdo 100 g por kilo"), pero convierte al escribir.

  advancedOpen = signal(false);
  yieldMode    = signal<'percent' | 'loss'>('percent');

  /** La unidad del producto elegido en el form. */
  private selectedUnit = computed(() =>
    this.units().find(u => u.id === this.form?.get('defaultUnitId')?.value));

  /**
   * Cargar la merma como cantidad solo tiene sentido si la unidad se subdivide: en kg se
   * piensa "pierdo 100 g por kilo", en "unidad" no hay nada más chico que una lechuga y la
   * conversión sería imposible sin saber cuánto pesa cada una.
   */
  lossModeAvailable = computed(() => (this.selectedUnitFactor() ?? 1) > 1);

  private selectedUnitFactor = computed(() => this.selectedUnit()?.toBaseFactor);

  /** Abreviatura de la unidad chica (g para kg), para el label del modo cantidad. */
  lossUnitAbbrev = computed(() => {
    const baseId = this.selectedUnit()?.baseUnitId;
    return this.units().find(u => u.id === baseId)?.abbreviation ?? '';
  });

  unitAbbrev = computed(() => this.selectedUnit()?.abbreviation ?? '');

  private isDefaultYield(value: number | null | undefined): boolean {
    return value == null || value === 100;
  }

  setYieldMode(mode: 'percent' | 'loss'): void {
    this.yieldMode.set(mode);
    if (mode === 'loss') this.syncLossFromPercent();
  }

  /** Modo cantidad → porcentaje. Pierdo 100 g de 1000 g = rinde 90%. */
  onYieldLossInput(): void {
    const loss   = this.form.get('yieldLoss')?.value;
    const factor = this.selectedUnitFactor();
    if (loss == null || loss === '' || !factor) {
      this.form.get('yieldPercentage')?.setValue(null, { emitEvent: false });
      return;
    }
    const percentage = Math.round((1 - (+loss / factor)) * 100 * 100) / 100;
    this.form.get('yieldPercentage')?.setValue(percentage, { emitEvent: false });
  }

  /** Porcentaje → modo cantidad, para que los dos campos digan lo mismo. */
  syncLossFromPercent(): void {
    const percentage = this.form.get('yieldPercentage')?.value;
    const factor     = this.selectedUnitFactor();
    if (percentage == null || percentage === '' || !factor) {
      this.form.get('yieldLoss')?.setValue(null, { emitEvent: false });
      return;
    }
    const loss = Math.round((1 - (+percentage / 100)) * factor * 100) / 100;
    this.form.get('yieldLoss')?.setValue(loss, { emitEvent: false });
  }

  yieldValue = computed(() => this.form?.get('yieldPercentage')?.value as number | null);

  /** "Para 1 kg en la receta se descuentan 1,111 kg" — el número que va a cambiar el food cost. */
  yieldPreview(): string | null {
    const percentage = this.form.get('yieldPercentage')?.value;
    if (percentage == null || percentage === '' || +percentage <= 0 || +percentage === 100) return null;
    // toLocaleString y no toFixed().replace(): el replace a mano arregla el decimal pero deja
    // los miles sin separar, y se rompe solo cuando aparece un número grande.
    const gross = (1 / (+percentage / 100)).toLocaleString('es-AR',
      { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    return this.i18n.t('products.yieldPreview', { net: 1, gross, unit: this.unitAbbrev() });
  }

  yieldAbove100(): boolean {
    const percentage = this.form.get('yieldPercentage')?.value;
    return percentage != null && percentage !== '' && +percentage > 100;
  }

}
