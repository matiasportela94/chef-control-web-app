import { Component, HostListener, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Api } from '../../api/api';
import { listProducts } from '../../api/fn/product-controller/list-products';
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
import { parseBlob } from '../../core/utils/parse-blob';
import { extractApiError } from '../../core/utils/api-error';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe, PaginatorComponent, ActionDialogComponent],
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss'
})
export class ProductsComponent implements OnInit {
  products = signal<ProductResponse[]>([]);
  loading  = signal(true);
  error    = signal<string | null>(null);
  page     = signal(1);
  pageSize = 20;
  total    = signal(0);

  units      = signal<UnitResponse[]>([]);
  categories = signal<CategoryResponse[]>([]);

  drawerOpen     = signal(false);
  editingProduct = signal<ProductResponse | null>(null);
  saving         = signal(false);
  saveError      = signal<string | null>(null);

  deactivating      = signal<ProductResponse | null>(null);
  deactivateLoading = signal(false);

  form: FormGroup;

  constructor(
    private api: Api,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      name:          ['', Validators.required],
      sku:           [''],
      defaultUnitId: ['', Validators.required],
      categoryId:    [''],
      minStock:      [null as number | null],
      maxStock:      [null as number | null],
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadProducts(), this.loadFormData()]);
  }

  async loadProducts(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.invoke(listProducts, { page: this.page() - 1, size: this.pageSize }) as unknown;
      const res = await parseBlob<PagedResponseProductResponse>(raw);
      this.products.set(res.content ?? []);
      this.total.set(res.totalElements ?? 0);
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
    this.form.reset({ name: '', sku: '', defaultUnitId: '', categoryId: '', minStock: null, maxStock: null });
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

  async goToPage(p: number): Promise<void> {
    this.page.set(p);
    await this.loadProducts();
  }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }
}
