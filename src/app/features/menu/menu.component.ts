import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Api } from '../../api/api';
import { list2 as listMenuItems }      from '../../api/fn/menu-item-controller/list-2';
import { create2 as createMenuItem }   from '../../api/fn/menu-item-controller/create-2';
import { update as updateMenuItem }    from '../../api/fn/menu-item-controller/update';
import { deactivate as deactivateMenuItem } from '../../api/fn/menu-item-controller/deactivate';
import { bulkDeactivate as bulkDeactivateMenuItems } from '../../api/fn/menu-item-controller/bulk-deactivate';
import { activate as activateMenuItem } from '../../api/fn/menu-item-controller/activate';
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
import { PagedResponseProductResponse }  from '../../api/models/paged-response-product-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatARS } from '../../core/utils/format';
import { extractApiError } from '../../core/utils/api-error';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { ActionDialogComponent } from '../../shared/components/action-dialog/action-dialog.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';
import { SearchFilterBarComponent, FilterBarState } from '../../shared/components/search-filter-bar/search-filter-bar.component';
import { isFormFieldInvalid } from '../../core/utils/form';
import { SelectComponent, SelectOption } from '../../shared/components/select/select.component';

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

  /** Carta actual (activa, default) vs cartas pasadas (desactivadas) — vistas separadas, no mezcladas. */
  viewMode = signal<'active' | 'inactive'>('active');

  filteredItems = computed(() => {
    const term = this.filterSearch().toLowerCase().trim();
    const cat  = this.filterCategoryId();
    return this.menuItems().filter(item => {
      if (cat && item.category !== cat) return false;
      if (term) return item.name?.toLowerCase().includes(term) ?? false;
      return true;
    });
  });

  pagedItems = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.filteredItems().slice(start, start + this.pageSize);
  });

  isFiltered = computed(() => this.filterSearch() !== '' || this.filterCategoryId() !== '');

  // ── Selección múltiple (solo en la carta activa) ────────────────
  selectedIds = signal<Set<string>>(new Set());
  selectedCount = computed(() => this.selectedIds().size);
  allVisibleSelected = computed(() => {
    const visible = this.pagedItems();
    return visible.length > 0 && visible.every(i => i.id && this.selectedIds().has(i.id));
  });

  bulkDeactivating      = signal(false);
  bulkDeactivateLoading = signal(false);

  activatingId = signal<string | null>(null);

  menuCategories = computed(() => {
    const cats = [...new Set(
      this.menuItems().map(i => i.category).filter((c): c is string => !!c)
    )].sort();
    return cats.map(c => ({ id: c, name: c }));
  });

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
  isActiveLocal = signal(true);

  // Deactivate dialog
  deactivating      = signal<MenuItemResponse | null>(null);
  deactivateLoading = signal(false);

  itemForm:   FormGroup;
  recipeForm: FormGroup;

  constructor(private api: Api, private fb: FormBuilder) {
    this.itemForm = this.fb.group({
      name:        ['', Validators.required],
      description: [''],
      price:       [null as number | null],
      category:    [''],
    });

    this.recipeForm = this.fb.group({
      servings: [1, [Validators.min(1)]],
      items:    this.fb.array([]),
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadMenuItems(), this.loadFormData()]);
  }

  async loadMenuItems(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.invoke(listMenuItems,
        { page: 0, size: 999, active: this.viewMode() === 'active' }) as unknown;
      const res = await parseBlob<PagedResponseMenuItemResponse>(raw);
      this.menuItems.set(res.content ?? []);
      void this.loadAllCosts(res.content ?? []);
    } catch {
      this.error.set('No se pudieron cargar los platos.');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Vista: carta actual / cartas pasadas ────────────────────────

  async switchView(mode: 'active' | 'inactive'): Promise<void> {
    if (this.viewMode() === mode) return;
    this.viewMode.set(mode);
    this.clearSelection();
    this.page.set(1);
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
      category:    item.category    ?? '',
    });
  }

  openCreate(): void {
    this.editing.set(null);
    this.viewing.set(null);
    this.readOnly.set(false);
    this.isActiveLocal.set(true);
    this.recipeCost.set(null);
    this.recipeItems.clear();
    this.recipeForm.reset({ servings: 1 });
    this.itemForm.get('price')!.setValidators([Validators.required, Validators.min(0)]);
    this.itemForm.reset({ name: '', description: '', price: null, category: '' });
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(item: MenuItemResponse): void {
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
      category:    item.category    ?? '',
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
    this.drawerOpen.set(false);
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
      ...(v.category?.trim()    ? { category:    v.category.trim() }    : {}),
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

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.drawerOpen())    this.closeDrawer();
    else if (this.deactivating()) this.deactivating.set(null);
  }

  onFiltersChange(state: FilterBarState): void {
    this.filterSearch.set(state.search);
    this.filterCategoryId.set(state.categoryId);
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
