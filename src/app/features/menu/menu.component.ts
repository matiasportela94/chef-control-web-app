import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DecimalPipe }                 from '@angular/common';
import { Api }                         from '../../api/api';
import { listMenuItems }               from '../../api/fn/menu-item-controller/list-menu-items';
import { createMenuItem }              from '../../api/fn/menu-item-controller/create-menu-item';
import { updateMenuItem }              from '../../api/fn/menu-item-controller/update-menu-item';
import { deactivateMenuItem }          from '../../api/fn/menu-item-controller/deactivate-menu-item';
import { bulkDeactivateMenuItems }     from '../../api/fn/menu-item-controller/bulk-deactivate-menu-items';
import { activateMenuItem }            from '../../api/fn/menu-item-controller/activate-menu-item';
import { getRecipe }                   from '../../api/fn/menu-item-controller/get-recipe';
import { setRecipe }                   from '../../api/fn/menu-item-controller/set-recipe';
import { deleteRecipe }                from '../../api/fn/menu-item-controller/delete-recipe';
import { getRecipeCost }               from '../../api/fn/menu-item-controller/get-recipe-cost';
import { listProducts }                from '../../api/fn/product-controller/list-products';
import { listUnits }                   from '../../api/fn/unit-controller/list-units';
import { MenuItemResponse }            from '../../api/models/menu-item-response';
import { RecipeResponse }              from '../../api/models/recipe-response';
import { RecipeCostResponse }          from '../../api/models/recipe-cost-response';
import { ProductResponse }             from '../../api/models/product-response';
import { UnitResponse }                from '../../api/models/unit-response';
import { PagedResponseMenuItemResponse } from '../../api/models/paged-response-menu-item-response';
import { PagedResponseProductResponse } from '../../api/models/paged-response-product-response';
import { parseBlob }                   from '../../core/utils/parse-blob';
import { formatARS }                   from '../../core/utils/format';
import { extractApiError }             from '../../core/utils/api-error';
import { PaginatorComponent }          from '../../shared/components/paginator/paginator.component';
import { ActionDialogComponent }       from '../../shared/components/action-dialog/action-dialog.component';
import { DrawerComponent }             from '../../shared/components/drawer/drawer.component';
import { SpinnerComponent }            from '../../shared/components/spinner/spinner.component';
import { SearchFilterBarComponent, FilterBarState } from '../../shared/components/search-filter-bar/search-filter-bar.component';
import { isFormFieldInvalid }          from '../../core/utils/form';
import { SelectComponent, SelectOption } from '../../shared/components/select/select.component';
import { listCartas }                  from '../../api/fn/carta-controller/list-cartas';
import { createCarta }                 from '../../api/fn/carta-controller/create-carta';
import { updateCarta }                 from '../../api/fn/carta-controller/update-carta';
import { deleteCarta }                 from '../../api/fn/carta-controller/delete-carta';
import { addCartaItems }               from '../../api/fn/carta-controller/add-carta-items';
import { removeCartaItems }            from '../../api/fn/carta-controller/remove-carta-items';
import { CartaResponse }               from '../../api/models/carta-response';
import { listMenuSections }            from '../../api/fn/menu-section-controller/list-menu-sections';
import { createMenuSection }           from '../../api/fn/menu-section-controller/create-menu-section';
import { updateMenuSection }           from '../../api/fn/menu-section-controller/update-menu-section';
import { deleteMenuSection }           from '../../api/fn/menu-section-controller/delete-menu-section';
import { reorderMenuSections }         from '../../api/fn/menu-section-controller/reorder-menu-sections';
import { MenuSectionResponse }         from '../../api/models/menu-section-response';
import { uploadMenuItemImage }         from '../../api/fn/menu-item-controller/upload-menu-item-image';
import { deleteMenuItemImage }         from '../../api/fn/menu-item-controller/delete-menu-item-image';
import { resizeImage }                 from '../../core/utils/image';
import { environment }                 from '../../../environments/environment';
import { I18nService }                 from '../../core/services/i18n.service';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe, PaginatorComponent, ActionDialogComponent, DrawerComponent, SpinnerComponent, SearchFilterBarComponent, SelectComponent],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.scss'
})
export class MenuComponent implements OnInit {
  menuItems = signal<MenuItemResponse[]>([]);
  loading   = signal(true);
  error     = signal<string | null>(null);
  page      = signal(1);
  readonly pageSize = 20;

  filterSearch     = signal('');
  filterCategoryId = signal('');

  /** Pasos del menú del restaurante, en el orden en que se come (no alfabético). */
  sections        = signal<MenuSectionResponse[]>([]);
  filterSectionId = signal('');

  sectionOptions = computed<SelectOption[]>(() =>
    this.sections().map(s => ({ value: s.id ?? '', label: s.name ?? '' }))
  );

  // Drawer de pasos
  sectionsDrawerOpen = signal(false);
  editingSection     = signal<MenuSectionResponse | null>(null);
  savingSection      = signal(false);
  sectionError       = signal<string | null>(null);
  deletingSection    = signal<MenuSectionResponse | null>(null);
  reordering         = signal(false);

  /**
   * Qué se está mirando: una carta concreta, o el catálogo completo de platos ('').
   * La carta dice qué se ofrece; el catálogo, qué existe. Son cosas distintas.
   */
  cartas          = signal<CartaResponse[]>([]);
  selectedCartaId = signal<string>('');
  cartaControl    = new FormControl<string>('', { nonNullable: true });

  selectedCarta = computed(() => this.cartas().find(c => c.id === this.selectedCartaId()) ?? null);
  catalogMode   = computed(() => this.selectedCartaId() === '');

  cartaOptions = computed<SelectOption[]>(() => [
    ...this.cartas().map(c => ({
      value: c.id ?? '',
      label: c.active ? (c.name ?? '') : `${c.name} (${this.t('menu.inactive')})`,
    })),
    { value: '', label: this.t('menu.allDishes') },
  ]);

  /** Solo en el catálogo: ver los platos dados de baja para reactivarlos. */
  viewMode = signal<'active' | 'inactive'>('active');

  // ── Drawer de carta (crear / renombrar) ─────────────────────────
  cartaDrawerOpen = signal(false);
  editingCarta    = signal<CartaResponse | null>(null);
  cartaSaving     = signal(false);
  cartaSaveError  = signal<string | null>(null);
  deletingCarta   = signal<CartaResponse | null>(null);
  deleteCartaLoading = signal(false);
  togglingCarta   = signal(false);

  removingFromCarta = signal(false);

  filteredItems = computed(() => {
    const term = this.filterSearch().toLowerCase().trim();
    const sec  = this.filterSectionId();
    return this.menuItems().filter(item => {
      if (sec && item.section?.id !== sec) return false;
      if (term) return item.name?.toLowerCase().includes(term) ?? false;
      return true;
    });
  });

  pagedItems = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.filteredItems().slice(start, start + this.pageSize);
  });

  isFiltered = computed(() => this.filterSearch() !== '' || this.filterSectionId() !== '');

  // ── Selección múltiple (no en la vista de dados de baja) ────────
  canSelect = computed(() => !this.catalogMode() || this.viewMode() === 'active');

  selectedIds = signal<Set<string>>(new Set());
  selectedCount = computed(() => this.selectedIds().size);
  allVisibleSelected = computed(() => {
    const visible = this.pagedItems();
    return visible.length > 0 && visible.every(i => i.id && this.selectedIds().has(i.id));
  });

  bulkDeactivating      = signal(false);
  bulkDeactivateLoading = signal(false);

  activatingId = signal<string | null>(null);

  /** En la carta se ven TODOS los platos del catálogo; los que están en la carta, destacados. */
  isInCarta(item: MenuItemResponse): boolean {
    return !!item.id && (this.selectedCarta()?.menuItemIds ?? []).includes(item.id);
  }

  /**
   * La URL lleva ?v= con la fecha de la última subida: el backend responde immutable con cache
   * de un año, así que sin ese parámetro el navegador se quedaría con la foto vieja para siempre.
   */
  imageUrl(item: MenuItemResponse): string | null {
    if (!item.id || !item.imageUpdatedAt) return null;
    return `${environment.apiUrl}/menu-items/${item.id}/image?v=${Date.parse(item.imageUpdatedAt)}`;
  }

  /** La foto del plato que está abierto en el drawer (editando o viendo). */
  currentImageUrl(): string | null {
    const item = this.editing() ?? this.viewing();
    return item ? this.imageUrl(item) : null;
  }

  sectionColor(item: MenuItemResponse): string {
    return item.section?.color || 'var(--text-3)';
  }

  /** Nombre del ícono de Tabler del paso, si tiene: la tarjeta lo usa en vez de la inicial. */
  sectionIcon(item: MenuItemResponse): string | null {
    return item.section?.icon?.trim() || null;
  }

  /** Preview en vivo mientras se escribe el nombre del ícono en el drawer de pasos. */
  get sectionIconPreview(): string {
    return (this.sectionForm.get('icon')?.value as string)?.trim() || '';
  }

  initial(item: MenuItemResponse): string {
    return (item.name ?? '?').trim().charAt(0).toUpperCase();
  }

  filterSection(id: string): void {
    this.filterSectionId.set(id);
    this.page.set(1);
  }

  products   = signal<ProductResponse[]>([]);
  units      = signal<UnitResponse[]>([]);

  productOptions = computed<SelectOption[]>(() =>
    this.products().map(p => ({ value: p.id ?? '', label: p.name ?? '' }))
  );
  unitOptions = computed<SelectOption[]>(() =>
    this.units().map(u => ({ value: u.id ?? '', label: u.abbreviation ?? '' }))
  );
  itemCosts  = signal<Map<string, RecipeCostResponse>>(new Map());

  // Drawer unificado
  drawerOpen    = signal(false);
  editing       = signal<MenuItemResponse | null>(null);
  viewing       = signal<MenuItemResponse | null>(null);
  readOnly      = signal(false);
  saving        = signal(false);
  saveError     = signal<string | null>(null);
  recipeLoading = signal(false);
  recipeCost    = signal<RecipeCostResponse | null>(null);

  // Foto del plato: pendiente (elegida pero no subida) y preview local
  pendingImage    = signal<Blob | null>(null);
  imagePreviewUrl = signal<string | null>(null);
  imageBusy       = signal(false);
  imageError      = signal<string | null>(null);
  isActiveLocal = signal(true);

  // Deactivate dialog
  deactivating      = signal<MenuItemResponse | null>(null);
  deactivateLoading = signal(false);

  itemForm:   FormGroup;
  recipeForm: FormGroup;

  cartaForm: FormGroup;
  sectionForm: FormGroup;

  constructor(private api: Api, private fb: FormBuilder, private i18n: I18nService) {
    this.cartaForm = this.fb.group({
      name: ['', Validators.required],
    });

    this.sectionForm = this.fb.group({
      name:  ['', Validators.required],
      color: ['#F36525'],
      icon:  [''],
    });

    this.itemForm = this.fb.group({
      name:        ['', Validators.required],
      description: [''],
      price:       [null as number | null],
      sectionId:   [''],
    });

    this.recipeForm = this.fb.group({
      servings: [1, [Validators.min(1)]],
      items:    this.fb.array([]),
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadCartas(), this.loadSections()]);
    // Arranca en la primera carta activa; si no hay ninguna, en el catálogo completo.
    const first = this.cartas().find(c => c.active) ?? this.cartas()[0];
    if (first?.id) {
      this.selectedCartaId.set(first.id);
      this.cartaControl.setValue(first.id);
    }
    await Promise.all([this.loadMenuItems(), this.loadFormData()]);
  }

  t(key: string): string {
    return this.i18n.t(key);
  }

  itemsLabel(): string {
    if (!this.catalogMode()) return this.t('menu.dishesInCarta');
    return this.viewMode() === 'active' ? this.t('menu.dishesInCatalog') : this.t('menu.dishesInactive');
  }

  async loadSections(): Promise<void> {
    try {
      const raw = await this.api.invoke(listMenuSections, {}) as unknown;
      this.sections.set(await parseBlob<MenuSectionResponse[]>(raw) ?? []);
    } catch { /* la pantalla sigue usable sin pasos */ }
  }

  async loadCartas(): Promise<void> {
    try {
      const raw = await this.api.invoke(listCartas, {}) as unknown;
      this.cartas.set(await parseBlob<CartaResponse[]>(raw) ?? []);
    } catch { /* la pantalla sigue usable en modo catálogo */ }
  }

  async loadMenuItems(): Promise<void> {
    if (this.menuItems().length === 0) this.loading.set(true); // evita el flash de spinner (y el salto de scroll) en recargas tras crear/editar/desactivar
    this.error.set(null);
    try {
      // Siempre el catálogo completo: la carta solo decide qué tarjetas se ven destacadas.
      const raw = await this.api.invoke(listMenuItems,
        { page: 0, size: 999, active: this.catalogMode() ? this.viewMode() === 'active' : true }) as unknown;
      const res = await parseBlob<PagedResponseMenuItemResponse>(raw);
      this.menuItems.set(res.content ?? []);
      void this.loadAllCosts(res.content ?? []);
    } catch {
      this.error.set('No se pudieron cargar los platos.');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Cambio de carta / catálogo ──────────────────────────────────

  async switchCarta(cartaId: string): Promise<void> {
    if (this.selectedCartaId() === cartaId) return;
    this.selectedCartaId.set(cartaId);
    this.viewMode.set('active');
    this.clearSelection();
    this.page.set(1);
    this.menuItems.set([]); // cambio real de dataset: acá sí va el spinner
    await this.loadMenuItems();
  }

  // ── CRUD de carta ───────────────────────────────────────────────

  openCreateCarta(): void {
    this.editingCarta.set(null);
    this.cartaForm.reset({ name: '' });
    this.cartaSaveError.set(null);
    this.cartaDrawerOpen.set(true);
  }

  openEditCarta(): void {
    const carta = this.selectedCarta();
    if (!carta) return;
    this.editingCarta.set(carta);
    this.cartaForm.reset({ name: carta.name ?? '' });
    this.cartaSaveError.set(null);
    this.cartaDrawerOpen.set(true);
  }

  async saveCarta(): Promise<void> {
    if (this.cartaForm.invalid) { this.cartaForm.markAllAsTouched(); return; }
    this.cartaSaving.set(true);
    this.cartaSaveError.set(null);
    const name = this.cartaForm.getRawValue().name!.trim();
    try {
      const editing = this.editingCarta();
      if (editing?.id) {
        await this.api.invoke(updateCarta, { id: editing.id, body: { name } });
        await this.loadCartas();
      } else {
        const raw = await this.api.invoke(createCarta, { body: { name, menuItemIds: [] } }) as unknown;
        const created = await parseBlob<CartaResponse>(raw);
        await this.loadCartas();
        if (created.id) {
          this.cartaControl.setValue(created.id);
          await this.switchCarta(created.id);
        }
      }
      this.cartaDrawerOpen.set(false);
    } catch (e: any) {
      this.cartaSaveError.set(extractApiError(e, this.t('menu.saveCartaError')));
    } finally {
      this.cartaSaving.set(false);
    }
  }

  async toggleCartaActive(): Promise<void> {
    const carta = this.selectedCarta();
    if (!carta?.id) return;
    this.togglingCarta.set(true);
    try {
      await this.api.invoke(updateCarta, { id: carta.id, body: { active: !carta.active } });
      await this.loadCartas();
    } catch { /* el interceptor global muestra el error */ }
    finally { this.togglingCarta.set(false); }
  }

  async confirmDeleteCarta(): Promise<void> {
    const carta = this.deletingCarta();
    if (!carta?.id) return;
    this.deleteCartaLoading.set(true);
    try {
      await this.api.invoke(deleteCarta, { id: carta.id });
      this.deletingCarta.set(null);
      await this.loadCartas();
      const next = this.cartas().find(c => c.active) ?? this.cartas()[0];
      this.cartaControl.setValue(next?.id ?? '');
      this.selectedCartaId.set('');          // fuerza que switchCarta detecte el cambio
      await this.switchCarta(next?.id ?? '');
      if (!next?.id) await this.loadMenuItems();
    } catch { /* stays in dialog */ }
    finally { this.deleteCartaLoading.set(false); }
  }

  // ── Alta y baja de platos en la carta, desde la tarjeta ─────────

  /** Meter un plato suelto en la carta desde su tarjeta. */
  async addItemToCarta(item: MenuItemResponse): Promise<void> {
    const cartaId = this.selectedCartaId();
    if (!cartaId || !item.id) return;
    try {
      await this.api.invoke(addCartaItems, { id: cartaId, body: { menuItemIds: [item.id] } });
      await this.loadCartas();
    } catch { /* el interceptor global muestra el error */ }
  }

  /** Sacar un plato suelto — misma llamada en lote, con una lista de uno. */
  async removeItemFromCarta(item: MenuItemResponse): Promise<void> {
    const cartaId = this.selectedCartaId();
    if (!cartaId || !item.id) return;
    this.removingFromCarta.set(true);
    try {
      await this.api.invoke(removeCartaItems, { id: cartaId, body: { menuItemIds: [item.id] } });
      await this.loadCartas();
    } catch { /* el interceptor global muestra el error */ }
    finally { this.removingFromCarta.set(false); }
  }

  /** Sacar de la carta ≠ dar de baja: el plato sigue en el catálogo. */
  async removeSelectedFromCarta(): Promise<void> {
    const cartaId = this.selectedCartaId();
    const menuItemIds = [...this.selectedIds()];
    if (!cartaId || menuItemIds.length === 0) return;
    this.removingFromCarta.set(true);
    try {
      await this.api.invoke(removeCartaItems, { id: cartaId, body: { menuItemIds } });
      this.clearSelection();
      await this.loadCartas();
    } catch { /* el interceptor global muestra el error */ }
    finally { this.removingFromCarta.set(false); }
  }

  // ── Vista del catálogo: activos / dados de baja ──────────────────

  async switchView(mode: 'active' | 'inactive'): Promise<void> {
    if (this.viewMode() === mode) return;
    this.viewMode.set(mode);
    this.clearSelection();
    this.page.set(1);
    this.menuItems.set([]); // fuerza el spinner acá (cambio real de dataset), no en las recargas por edición
    await this.loadMenuItems();
  }

  // ── Selección múltiple + baja masiva ────────────────────────────

  isSelected(id?: string): boolean {
    return !!id && this.selectedIds().has(id);
  }

  toggleSelect(id?: string): void {
    if (!id) return;
    const next = new Set(this.selectedIds());
    next.has(id) ? next.delete(id) : next.add(id);
    this.selectedIds.set(next);
  }

  toggleSelectAllVisible(): void {
    const visible = this.pagedItems().map(i => i.id).filter((id): id is string => !!id);
    if (this.allVisibleSelected()) {
      const next = new Set(this.selectedIds());
      visible.forEach(id => next.delete(id));
      this.selectedIds.set(next);
    } else {
      this.selectedIds.set(new Set([...this.selectedIds(), ...visible]));
    }
  }

  get selectedItems(): MenuItemResponse[] {
    const ids = this.selectedIds();
    return this.menuItems().filter(i => i.id && ids.has(i.id));
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  get selectedNamesPreview(): string {
    const items = this.selectedItems;
    const names = items.slice(0, 5).map(i => i.name).join(', ');
    return items.length > 5 ? `${names}, +${items.length - 5} más` : names;
  }

  async confirmBulkDeactivate(): Promise<void> {
    const ids = [...this.selectedIds()];
    if (ids.length === 0) return;
    this.bulkDeactivateLoading.set(true);
    try {
      await this.api.invoke(bulkDeactivateMenuItems, { body: { ids } });
      this.bulkDeactivating.set(false);
      this.clearSelection();
      await this.loadMenuItems();
    } catch { /* stays in dialog */ }
    finally { this.bulkDeactivateLoading.set(false); }
  }

  // ── Reactivar (vista de cartas pasadas) ─────────────────────────

  async reactivateItem(item: MenuItemResponse): Promise<void> {
    if (!item.id) return;
    this.activatingId.set(item.id);
    try {
      await this.api.invoke(activateMenuItem, { id: item.id });
      await this.loadMenuItems();
    } catch { /* toast de error lo maneja el interceptor global si aplica */ }
    finally { this.activatingId.set(null); }
  }

  private async loadAllCosts(items: MenuItemResponse[]): Promise<void> {
    const results = await Promise.allSettled(
      items.filter(i => i.id).map(async i => {
        const raw = await this.api.invoke(getRecipeCost, { id: i.id! }) as unknown;
        return { id: i.id!, cost: await parseBlob<RecipeCostResponse>(raw) };
      })
    );
    const map = new Map<string, RecipeCostResponse>();
    for (const r of results) {
      if (r.status === 'fulfilled') map.set(r.value.id, r.value.cost);
    }
    this.itemCosts.set(map);
  }

  async loadFormData(): Promise<void> {
    try {
      const [prodsRaw, unitsRaw] = await Promise.all([
        this.api.invoke(listProducts, { page: 0, size: 999 }) as unknown,
        this.api.invoke(listUnits) as unknown,
      ]);
      const prodsRes = await parseBlob<PagedResponseProductResponse>(prodsRaw);
      this.products.set(prodsRes.content ?? []);
      this.units.set(await parseBlob<UnitResponse[]>(unitsRaw));
    } catch { /* non-critical */ }
  }

  // ── Drawer ───────────────────────────────────────────────────

  openView(item: MenuItemResponse): void {
    this.resetImageState();
    this.viewing.set(item);
    this.editing.set(null);
    this.readOnly.set(true);
    this.isActiveLocal.set(item.active ?? true);
    this.recipeCost.set(null);
    this.recipeItems.clear();
    this.recipeForm.reset({ servings: 1 });
    this.saveError.set(null);
    this.drawerOpen.set(true);
    void this.loadRecipe(item);
  }

  private resetImageState(): void {
    this.revokePreview();
    this.pendingImage.set(null);
    this.imageError.set(null);
  }

  switchToEdit(): void {
    const item = this.viewing();
    if (!item) return;
    this.viewing.set(null);
    this.editing.set(item);
    this.readOnly.set(false);
    this.itemForm.get('price')!.clearValidators();
    this.itemForm.reset({
      name:        item.name        ?? '',
      description: item.description ?? '',
      price:       item.price       ?? null,
      sectionId:   item.section?.id ?? '',
    });
  }

  openCreate(): void {
    this.resetImageState();
    this.editing.set(null);
    this.viewing.set(null);
    this.readOnly.set(false);
    this.isActiveLocal.set(true);
    this.recipeCost.set(null);
    this.recipeItems.clear();
    this.recipeForm.reset({ servings: 1 });
    this.itemForm.get('price')!.setValidators([Validators.required, Validators.min(0)]);
    this.itemForm.reset({ name: '', description: '', price: null, sectionId: '' });
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(item: MenuItemResponse): void {
    this.resetImageState();
    this.editing.set(item);
    this.viewing.set(null);
    this.readOnly.set(false);
    this.isActiveLocal.set(item.active ?? true);
    this.recipeCost.set(null);
    this.recipeItems.clear();
    this.recipeForm.reset({ servings: 1 });
    this.itemForm.get('price')!.clearValidators();
    this.itemForm.reset({
      name:        item.name        ?? '',
      description: item.description ?? '',
      price:       item.price       ?? null,
      sectionId:   item.section?.id ?? '',
    });
    this.saveError.set(null);
    this.drawerOpen.set(true);
    void this.loadRecipe(item);
  }

  private async loadRecipe(item: MenuItemResponse): Promise<void> {
    if (!item.id) return;
    this.recipeLoading.set(true);
    try {
      const [recipeRaw, costRaw] = await Promise.all([
        this.api.invoke(getRecipe, { id: item.id }) as unknown,
        this.api.invoke(getRecipeCost, { id: item.id }) as unknown,
      ]);
      const recipe = await parseBlob<RecipeResponse>(recipeRaw);
      this.recipeForm.patchValue({ servings: recipe.servings ?? 1 });
      for (const ri of recipe.items ?? []) {
        const g = this.newRecipeItemGroup();
        g.patchValue({ productId: ri.productId, unitId: ri.unitId, quantity: ri.quantity });
        this.recipeItems.push(g);
      }
      try {
        this.recipeCost.set(await parseBlob<RecipeCostResponse>(costRaw));
      } catch { /* no cost yet */ }
    } catch { /* no recipe yet — start empty */ }
    finally { this.recipeLoading.set(false); }
  }

  closeDrawer(): void {
    this.revokePreview();
    this.drawerOpen.set(false);
  }

  // ── Foto del plato ──────────────────────────────────────────────

  async onImagePicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;

    this.imageError.set(null);
    this.imageBusy.set(true);
    try {
      const resized = await resizeImage(file);
      this.revokePreview();
      this.pendingImage.set(resized);
      this.imagePreviewUrl.set(URL.createObjectURL(resized));

      // Si el plato ya existe, se sube ahora; si es nuevo, va al guardar (necesita id).
      const id = this.editing()?.id;
      if (id) await this.uploadPendingImage(id);
    } catch {
      this.imageError.set(this.t('menu.imageError'));
    } finally {
      this.imageBusy.set(false);
    }
  }

  private async uploadPendingImage(menuItemId: string): Promise<void> {
    const blob = this.pendingImage();
    if (!blob) return;
    await this.api.invoke(uploadMenuItemImage, { id: menuItemId, body: { file: blob } });
    this.pendingImage.set(null);
  }

  async removeImage(): Promise<void> {
    this.revokePreview();
    this.pendingImage.set(null);

    const id = this.editing()?.id ?? this.viewing()?.id;
    if (!id) return;
    this.imageBusy.set(true);
    try {
      await this.api.invoke(deleteMenuItemImage, { id });
      await this.loadMenuItems();
      const fresh = this.menuItems().find(i => i.id === id) ?? null;
      if (this.editing()) this.editing.set(fresh);
      if (this.viewing()) this.viewing.set(fresh);
    } catch {
      this.imageError.set(this.t('menu.imageError'));
    } finally {
      this.imageBusy.set(false);
    }
  }

  /** El object URL del preview ocupa memoria hasta que se libera. */
  private revokePreview(): void {
    const url = this.imagePreviewUrl();
    if (url) URL.revokeObjectURL(url);
    this.imagePreviewUrl.set(null);
  }

  toggleActive(active: boolean): void {
    this.isActiveLocal.set(active);
  }

  // ── Save ─────────────────────────────────────────────────────

  async saveItem(): Promise<void> {
    if (this.itemForm.invalid) { this.itemForm.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveError.set(null);
    const v = this.itemForm.getRawValue();
    const body = {
      name: v.name,
      ...(v.description?.trim() ? { description: v.description.trim() } : {}),
      ...(v.price != null       ? { price:       +v.price }             : {}),
      ...(v.sectionId           ? { sectionId:   v.sectionId }          : {}),
    };
    try {
      const ed = this.editing();
      let itemId: string;
      if (ed?.id) {
        await this.api.invoke(updateMenuItem, { id: ed.id, body });
        itemId = ed.id;
      } else {
        const raw = await this.api.invoke(createMenuItem, { body }) as unknown;
        const created = await parseBlob<MenuItemResponse>(raw);
        itemId = created.id!;
      }

      // Save recipe if items exist
      if (this.recipeItems.length > 0) {
        if (this.recipeForm.invalid) { this.recipeForm.markAllAsTouched(); return; }
        const rv = this.recipeForm.getRawValue();
        await this.api.invoke(setRecipe, {
          id: itemId,
          body: {
            servings: +rv.servings || 1,
            items: rv.items.map((i: any) => ({
              productId: i.productId,
              unitId:    i.unitId,
              quantity:  +i.quantity,
            })),
          },
        });
      }

      // Estado tocado desde el drawer: desactivar o reactivar según hacia dónde se movió el toggle
      if (ed?.id && ed.active && !this.isActiveLocal()) {
        await this.api.invoke(deactivateMenuItem, { id: ed.id });
      } else if (ed?.id && !ed.active && this.isActiveLocal()) {
        await this.api.invoke(activateMenuItem, { id: ed.id });
      }

      if (this.pendingImage()) await this.uploadPendingImage(itemId);

      this.revokePreview();
      this.drawerOpen.set(false);
      await this.loadMenuItems();
    } catch (e: any) {
      this.saveError.set(extractApiError(e, 'Error al guardar el plato'));
    } finally {
      this.saving.set(false);
    }
  }

  // ── Recipe helpers ───────────────────────────────────────────

  get recipeItems(): FormArray {
    return this.recipeForm.get('items') as FormArray;
  }

  private newRecipeItemGroup(): FormGroup {
    return this.fb.group({
      productId: ['', Validators.required],
      unitId:    ['', Validators.required],
      quantity:  [null as number | null, [Validators.required, Validators.min(0.001)]],
    });
  }

  addRecipeItem(): void {
    this.recipeItems.push(this.newRecipeItemGroup());
  }

  removeRecipeItem(index: number): void {
    this.recipeItems.removeAt(index);
  }

  onRecipeProductChange(index: number): void {
    const productId = this.recipeItems.at(index).get('productId')?.value;
    const product = this.products().find(p => p.id === productId);
    if (product?.defaultUnit?.id) {
      this.recipeItems.at(index).get('unitId')?.setValue(product.defaultUnit.id);
    }
  }

  async removeRecipe(): Promise<void> {
    const ed = this.editing();
    if (!ed?.id) { this.recipeItems.clear(); return; }
    try {
      await this.api.invoke(deleteRecipe, { id: ed.id });
      this.recipeItems.clear();
      this.recipeCost.set(null);
    } catch { /* stays */ }
  }

  // ── Deactivate ───────────────────────────────────────────────

  async confirmDeactivate(): Promise<void> {
    const item = this.deactivating();
    if (!item?.id) return;
    this.deactivateLoading.set(true);
    try {
      await this.api.invoke(deactivateMenuItem, { id: item.id });
      this.deactivating.set(null);
      await this.loadMenuItems();
    } catch { /* stays in dialog */ }
    finally { this.deactivateLoading.set(false); }
  }

  // ── Pasos del menú ──────────────────────────────────────────────

  openSections(): void {
    this.editingSection.set(null);
    this.sectionError.set(null);
    this.sectionForm.reset({ name: '', color: '#F36525', icon: '' });
    this.sectionsDrawerOpen.set(true);
  }

  editSection(section: MenuSectionResponse): void {
    this.editingSection.set(section);
    this.sectionError.set(null);
    this.sectionForm.reset({
      name:  section.name ?? '',
      color: section.color ?? '#F36525',
      icon:  section.icon ?? '',
    });
  }

  cancelSectionEdit(): void {
    this.editingSection.set(null);
    this.sectionError.set(null);
    this.sectionForm.reset({ name: '', color: '#F36525', icon: '' });
  }

  async saveSection(): Promise<void> {
    if (this.sectionForm.invalid) { this.sectionForm.markAllAsTouched(); return; }
    this.savingSection.set(true);
    this.sectionError.set(null);
    const v = this.sectionForm.getRawValue();
    const body = { name: v.name!.trim(), color: v.color, icon: v.icon?.trim() || undefined };
    try {
      const editing = this.editingSection();
      if (editing?.id) await this.api.invoke(updateMenuSection, { id: editing.id, body });
      else             await this.api.invoke(createMenuSection, { body });
      this.cancelSectionEdit();
      await Promise.all([this.loadSections(), this.loadMenuItems()]);
    } catch (e: any) {
      this.sectionError.set(extractApiError(e, this.t('menu.saveSectionError')));
    } finally {
      this.savingSection.set(false);
    }
  }

  /** Mover un paso una posición: el backend recibe la lista completa ya ordenada. */
  async moveSection(index: number, delta: number): Promise<void> {
    const list = [...this.sections()];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];

    this.sections.set(list); // optimista: el orden se ve al toque
    this.reordering.set(true);
    try {
      await this.api.invoke(reorderMenuSections,
        { body: { sectionIds: list.map(s => s.id!) } });
      await this.loadSections();
    } catch {
      await this.loadSections(); // si falla, vuelve a lo que dice el servidor
    } finally {
      this.reordering.set(false);
    }
  }

  async confirmDeleteSection(): Promise<void> {
    const section = this.deletingSection();
    if (!section?.id) return;
    try {
      await this.api.invoke(deleteMenuSection, { id: section.id });
      this.deletingSection.set(null);
      if (this.filterSectionId() === section.id) this.filterSectionId.set('');
      await Promise.all([this.loadSections(), this.loadMenuItems()]);
    } catch (e: any) {
      this.sectionError.set(extractApiError(e, this.t('menu.deleteSectionError')));
      this.deletingSection.set(null);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.drawerOpen())            this.closeDrawer();
    else if (this.deletingSection())  this.deletingSection.set(null);
    else if (this.sectionsDrawerOpen()) this.sectionsDrawerOpen.set(false);
    else if (this.cartaDrawerOpen())  this.cartaDrawerOpen.set(false);
    else if (this.deletingCarta())    this.deletingCarta.set(null);
    else if (this.deactivating())     this.deactivating.set(null);
  }

  onFiltersChange(state: FilterBarState): void {
    this.filterSearch.set(state.search);
    this.page.set(1);
  }

  goToPage(p: number): void { this.page.set(p); }

  productName(id: string): string {
    return this.products().find(p => p.id === id)?.name ?? '—';
  }

  unitAbbr(id: string): string {
    return this.units().find(u => u.id === id)?.abbreviation ?? '';
  }

  ingredientCategoryIcon(productId: string): string {
    const icon = this.products().find(p => p.id === productId)?.category?.icon;
    return icon ? 'ti-' + icon : 'ti-leaf';
  }

  ingredientCategoryColor(productId: string): string {
    return this.products().find(p => p.id === productId)?.category?.color ?? 'var(--text-3)';
  }

  isInvalid = (form: FormGroup, field: string) => isFormFieldInvalid(form, field);

  isRecipeItemInvalid(index: number, field: string): boolean {
    const ctrl = this.recipeItems.at(index).get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  readonly formatARS = formatARS;
}
