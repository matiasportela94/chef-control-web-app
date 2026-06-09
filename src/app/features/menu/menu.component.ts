import { Component, HostListener, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api } from '../../api/api';
import { list2 as listMenuItems }      from '../../api/fn/menu-item-controller/list-2';
import { create2 as createMenuItem }   from '../../api/fn/menu-item-controller/create-2';
import { update as updateMenuItem }    from '../../api/fn/menu-item-controller/update';
import { deactivate as deactivateMenuItem } from '../../api/fn/menu-item-controller/deactivate';
import { getRecipe }                   from '../../api/fn/menu-item-controller/get-recipe';
import { setRecipe }                   from '../../api/fn/menu-item-controller/set-recipe';
import { deleteRecipe }                from '../../api/fn/menu-item-controller/delete-recipe';
import { listProducts }                from '../../api/fn/product-controller/list-products';
import { listUnits }                   from '../../api/fn/unit-controller/list-units';
import { MenuItemResponse }            from '../../api/models/menu-item-response';
import { RecipeResponse }              from '../../api/models/recipe-response';
import { ProductResponse }             from '../../api/models/product-response';
import { UnitResponse }                from '../../api/models/unit-response';
import { PagedResponseMenuItemResponse } from '../../api/models/paged-response-menu-item-response';
import { PagedResponseProductResponse }  from '../../api/models/paged-response-product-response';
import { DecimalPipe } from '@angular/common';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatARS } from '../../core/utils/format';
import { extractApiError } from '../../core/utils/api-error';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { ActionDialogComponent } from '../../shared/components/action-dialog/action-dialog.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { isFormFieldInvalid } from '../../core/utils/form';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe, PaginatorComponent, ActionDialogComponent, DrawerComponent],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.scss'
})
export class MenuComponent implements OnInit {
  menuItems = signal<MenuItemResponse[]>([]);
  loading   = signal(true);
  error     = signal<string | null>(null);
  page      = signal(1);
  pageSize  = 20;
  total     = signal(0);

  products = signal<ProductResponse[]>([]);
  units    = signal<UnitResponse[]>([]);

  // Item drawer (create / edit)
  itemDrawerOpen = signal(false);
  editing        = signal<MenuItemResponse | null>(null);
  saving         = signal(false);
  saveError      = signal<string | null>(null);

  // Recipe drawer
  recipeDrawerOpen = signal(false);
  recipeItem       = signal<MenuItemResponse | null>(null);
  recipeLoading    = signal(false);
  recipeSaving     = signal(false);
  recipeError      = signal<string | null>(null);
  deleteRecipeLoading = signal(false);

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
      const raw = await this.api.invoke(listMenuItems, { page: this.page() - 1, size: this.pageSize }) as unknown;
      const res = await parseBlob<PagedResponseMenuItemResponse>(raw);
      this.menuItems.set(res.content ?? []);
      this.total.set(res.totalElements ?? 0);
    } catch {
      this.error.set('No se pudieron cargar los platos.');
    } finally {
      this.loading.set(false);
    }
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

  // ── Item drawer ──────────────────────────────────────────────

  openCreate(): void {
    this.editing.set(null);
    this.itemForm.get('price')!.setValidators([Validators.required, Validators.min(0)]);
    this.itemForm.reset({ name: '', description: '', price: null, category: '' });
    this.saveError.set(null);
    this.itemDrawerOpen.set(true);
  }

  openEdit(item: MenuItemResponse): void {
    this.editing.set(item);
    this.itemForm.get('price')!.clearValidators();
    this.itemForm.reset({
      name:        item.name        ?? '',
      description: item.description ?? '',
      price:       item.price       ?? null,
      category:    item.category    ?? '',
    });
    this.saveError.set(null);
    this.itemDrawerOpen.set(true);
  }

  closeItemDrawer(): void {
    this.itemDrawerOpen.set(false);
  }

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
      if (ed?.id) {
        await this.api.invoke(updateMenuItem, { id: ed.id, body });
      } else {
        await this.api.invoke(createMenuItem, { body });
      }
      this.itemDrawerOpen.set(false);
      await this.loadMenuItems();
    } catch (e: any) {
      this.saveError.set(extractApiError(e, 'Error al guardar el plato'));
    } finally {
      this.saving.set(false);
    }
  }

  // ── Recipe drawer ────────────────────────────────────────────

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

  async openRecipe(item: MenuItemResponse): Promise<void> {
    this.recipeItem.set(item);
    this.recipeItems.clear();
    this.recipeForm.reset({ servings: 1 });
    this.recipeError.set(null);
    this.recipeDrawerOpen.set(true);
    this.recipeLoading.set(true);
    try {
      const raw = await this.api.invoke(getRecipe, { id: item.id! }) as unknown;
      const recipe = await parseBlob<RecipeResponse>(raw);
      this.recipeForm.patchValue({ servings: recipe.servings ?? 1 });
      for (const ri of recipe.items ?? []) {
        const g = this.newRecipeItemGroup();
        g.patchValue({ productId: ri.productId, unitId: ri.unitId, quantity: ri.quantity });
        this.recipeItems.push(g);
      }
    } catch { /* no recipe yet — start empty */ }
    finally {
      this.recipeLoading.set(false);
    }
  }

  closeRecipeDrawer(): void {
    this.recipeDrawerOpen.set(false);
  }

  async saveRecipe(): Promise<void> {
    if (this.recipeForm.invalid || this.recipeItems.length === 0) {
      this.recipeForm.markAllAsTouched();
      if (this.recipeItems.length === 0) this.recipeError.set('Agregá al menos un ingrediente.');
      return;
    }
    this.recipeSaving.set(true);
    this.recipeError.set(null);
    const v = this.recipeForm.getRawValue();
    const body = {
      servings: +v.servings || 1,
      items: v.items.map((i: any) => ({
        productId: i.productId,
        unitId:    i.unitId,
        quantity:  +i.quantity,
      })),
    };
    try {
      await this.api.invoke(setRecipe, { id: this.recipeItem()!.id!, body });
      this.recipeDrawerOpen.set(false);
    } catch (e: any) {
      this.recipeError.set(extractApiError(e, 'Error al guardar la receta'));
    } finally {
      this.recipeSaving.set(false);
    }
  }

  async confirmDeleteRecipe(): Promise<void> {
    const item = this.recipeItem();
    if (!item?.id) return;
    this.deleteRecipeLoading.set(true);
    try {
      await this.api.invoke(deleteRecipe, { id: item.id });
      this.recipeDrawerOpen.set(false);
    } catch { /* stays open */ }
    finally {
      this.deleteRecipeLoading.set(false);
    }
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
    finally {
      this.deactivateLoading.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.itemDrawerOpen())   this.closeItemDrawer();
    else if (this.recipeDrawerOpen()) this.closeRecipeDrawer();
    else if (this.deactivating()) this.deactivating.set(null);
  }

  async goToPage(p: number): Promise<void> {
    this.page.set(p);
    await this.loadMenuItems();
  }

  isInvalid = (form: FormGroup, field: string) => isFormFieldInvalid(form, field);

  isRecipeItemInvalid(index: number, field: string): boolean {
    const ctrl = this.recipeItems.at(index).get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  readonly formatARS = formatARS;
}
