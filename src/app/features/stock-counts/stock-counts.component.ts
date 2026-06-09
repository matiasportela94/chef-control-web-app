import { Component, HostListener, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api } from '../../api/api';
import { list as listStockCounts } from '../../api/fn/stock-count-controller/list';
import { create as createStockCount } from '../../api/fn/stock-count-controller/create';
import { listProducts } from '../../api/fn/product-controller/list-products';
import { StockCountResponse } from '../../api/models/stock-count-response';
import { ProductResponse } from '../../api/models/product-response';
import { PagedResponseStockCountResponse } from '../../api/models/paged-response-stock-count-response';
import { PagedResponseProductResponse } from '../../api/models/paged-response-product-response';
import { DecimalPipe } from '@angular/common';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatDatetime } from '../../core/utils/format';
import { extractApiError } from '../../core/utils/api-error';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';

interface ProductMeta {
  name: string;
  sku?: string;
  unitAbbr: string;
}

@Component({
  selector: 'app-stock-counts',
  standalone: true,
  imports: [ReactiveFormsModule, PaginatorComponent, DecimalPipe, DrawerComponent],
  templateUrl: './stock-counts.component.html',
  styleUrl: './stock-counts.component.scss'
})
export class StockCountsComponent implements OnInit {
  counts   = signal<StockCountResponse[]>([]);
  loading  = signal(true);
  error    = signal<string | null>(null);
  page     = signal(1);
  pageSize = 20;
  total    = signal(0);

  expanded = signal<string | null>(null);

  drawerOpen    = signal(false);
  loadingForm   = signal(false);
  saving        = signal(false);
  saveError     = signal<string | null>(null);

  productMeta: ProductMeta[] = [];
  form: FormGroup;

  constructor(private api: Api, private fb: FormBuilder) {
    this.form = this.fb.group({
      items: this.fb.array([]),
      notes: [''],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadCounts();
  }

  get items(): FormArray {
    return this.form.get('items') as FormArray;
  }

  async loadCounts(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.invoke(listStockCounts, { page: this.page() - 1, size: this.pageSize }) as unknown;
      const res = await parseBlob<PagedResponseStockCountResponse>(raw);
      this.counts.set(res.content ?? []);
      this.total.set(res.totalElements ?? 0);
    } catch {
      this.error.set('No se pudieron cargar los conteos.');
    } finally {
      this.loading.set(false);
    }
  }

  async openCreate(): Promise<void> {
    this.items.clear();
    this.productMeta = [];
    this.form.patchValue({ notes: '' });
    this.saveError.set(null);
    this.drawerOpen.set(true);
    this.loadingForm.set(true);
    try {
      const raw = await this.api.invoke(listProducts, { page: 0, size: 999 }) as unknown;
      const res = await parseBlob<PagedResponseProductResponse>(raw);
      const products = (res.content ?? []).filter((p: ProductResponse) => p.isActive);
      for (const p of products) {
        this.items.push(this.fb.group({
          productId:       [p.id, Validators.required],
          unitId:          [p.defaultUnit?.id ?? '', Validators.required],
          countedQuantity: [null as number | null, [Validators.required, Validators.min(0)]],
        }));
        this.productMeta.push({
          name:     p.name ?? '—',
          sku:      p.sku,
          unitAbbr: p.defaultUnit?.abbreviation ?? '',
        });
      }
    } catch {
      this.saveError.set('No se pudieron cargar los productos.');
    } finally {
      this.loadingForm.set(false);
    }
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.drawerOpen()) this.closeDrawer();
  }

  toggleExpand(id?: string): void {
    if (!id) return;
    this.expanded.set(this.expanded() === id ? null : id);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveError.set(null);
    const v = this.form.getRawValue();
    const body = {
      items: v.items
        .filter((i: any) => i.countedQuantity != null && i.countedQuantity !== '')
        .map((i: any) => ({
          productId:       i.productId,
          unitId:          i.unitId,
          countedQuantity: +i.countedQuantity,
        })),
      ...(v.notes?.trim() ? { notes: v.notes.trim() } : {}),
    };
    if (body.items.length === 0) {
      this.saveError.set('Ingresá al menos una cantidad.');
      this.saving.set(false);
      return;
    }
    try {
      await this.api.invoke(createStockCount, { body });
      this.drawerOpen.set(false);
      await this.loadCounts();
    } catch (e: any) {
      this.saveError.set(extractApiError(e, 'Error al guardar el conteo'));
    } finally {
      this.saving.set(false);
    }
  }

  async goToPage(p: number): Promise<void> {
    this.page.set(p);
    await this.loadCounts();
  }

  isItemInvalid(index: number, field: string): boolean {
    const ctrl = this.items.at(index)?.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  readonly formatDate = formatDatetime;
}
