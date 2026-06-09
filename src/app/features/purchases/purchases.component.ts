import { Component, HostListener, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Api } from '../../api/api';
import { listPurchases } from '../../api/fn/purchase-controller/list-purchases';
import { createPurchase } from '../../api/fn/purchase-controller/create-purchase';
import { getPurchase } from '../../api/fn/purchase-controller/get-purchase';
import { listProducts } from '../../api/fn/product-controller/list-products';
import { listSuppliers } from '../../api/fn/supplier-controller/list-suppliers';
import { listUnits } from '../../api/fn/unit-controller/list-units';
import { PurchaseResponse } from '../../api/models/purchase-response';
import { PurchaseDetailResponse } from '../../api/models/purchase-detail-response';
import { ProductResponse } from '../../api/models/product-response';
import { SupplierResponse } from '../../api/models/supplier-response';
import { UnitResponse } from '../../api/models/unit-response';
import { PagedResponsePurchaseResponse } from '../../api/models/paged-response-purchase-response';
import { PagedResponseProductResponse } from '../../api/models/paged-response-product-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';

@Component({
  selector: 'app-purchases',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe, PaginatorComponent],
  templateUrl: './purchases.component.html',
  styleUrl: './purchases.component.scss'
})
export class PurchasesComponent implements OnInit {
  purchases = signal<PurchaseResponse[]>([]);
  loading   = signal(true);
  error     = signal<string | null>(null);
  page      = signal(1);
  pageSize  = 20;
  total     = signal(0);

  products  = signal<ProductResponse[]>([]);
  suppliers = signal<SupplierResponse[]>([]);
  units     = signal<UnitResponse[]>([]);

  createOpen = signal(false);
  saving     = signal(false);
  saveError  = signal<string | null>(null);

  detailOpen    = signal(false);
  detail        = signal<PurchaseDetailResponse | null>(null);
  detailLoading = signal(false);

  form: FormGroup;

  constructor(private api: Api, private fb: FormBuilder) {
    this.form = this.fb.group({
      purchasedAt: [this.todayISO()],
      supplierId:  [''],
      notes:       [''],
      items:       this.fb.array([], Validators.minLength(1)),
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadPurchases(), this.loadFormData()]);
  }

  private todayISO(): string {
    return new Date().toISOString().substring(0, 10);
  }

  get items(): FormArray {
    return this.form.get('items') as FormArray;
  }

  async loadPurchases(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.invoke(listPurchases, { page: this.page() - 1, size: this.pageSize }) as unknown;
      const res = await parseBlob<PagedResponsePurchaseResponse>(raw);
      this.purchases.set(res.content ?? []);
      this.total.set(res.totalElements ?? 0);
    } catch {
      this.error.set('No se pudieron cargar las compras.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadFormData(): Promise<void> {
    try {
      const [prodsRaw, suppliersRaw, unitsRaw] = await Promise.all([
        this.api.invoke(listProducts, { page: 0, size: 999 }) as unknown,
        this.api.invoke(listSuppliers) as unknown,
        this.api.invoke(listUnits) as unknown,
      ]);
      const prodsRes = await parseBlob<PagedResponseProductResponse>(prodsRaw);
      this.products.set(prodsRes.content ?? []);
      this.suppliers.set(await parseBlob<SupplierResponse[]>(suppliersRaw));
      this.units.set(await parseBlob<UnitResponse[]>(unitsRaw));
    } catch { /* non-critical, selects stay empty */ }
  }

  openCreate(): void {
    this.items.clear();
    this.form.reset({ purchasedAt: this.todayISO(), supplierId: '', notes: '' });
    this.addItem();
    this.saveError.set(null);
    this.createOpen.set(true);
  }

  closeCreate(): void {
    this.createOpen.set(false);
  }

  private newItemGroup(): FormGroup {
    return this.fb.group({
      productId:      ['', Validators.required],
      unitId:         ['', Validators.required],
      quantity:       [null as number | null, [Validators.required, Validators.min(0.001)]],
      pricePerUnit:   [null as number | null, [Validators.required, Validators.min(0)]],
      expirationDate: [null as string | null],
    });
  }

  addItem(): void {
    this.items.push(this.newItemGroup());
  }

  removeItem(index: number): void {
    this.items.removeAt(index);
  }

  onProductChange(index: number): void {
    const productId = this.items.at(index).get('productId')?.value;
    const product = this.products().find(p => p.id === productId);
    if (product?.defaultUnit?.id) {
      this.items.at(index).get('unitId')?.setValue(product.defaultUnit.id);
    }
  }

  itemSubtotal(index: number): number {
    const v = this.items.at(index).getRawValue();
    return (+(v.quantity) || 0) * (+(v.pricePerUnit) || 0);
  }

  get grandTotal(): number {
    return this.items.controls.reduce((sum, _, i) => sum + this.itemSubtotal(i), 0);
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      if (this.items.length === 0) this.saveError.set('Agregá al menos un ítem.');
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    const v = this.form.getRawValue();
    const body = {
      items: v.items.map((item: any) => ({
        productId:    item.productId,
        unitId:       item.unitId,
        quantity:     +item.quantity,
        pricePerUnit: +item.pricePerUnit,
        ...(item.expirationDate ? { expirationDate: item.expirationDate } : {}),
      })),
      ...(v.purchasedAt ? { purchasedAt: v.purchasedAt } : {}),
      ...(v.supplierId  ? { supplierId:  v.supplierId  } : {}),
      ...(v.notes?.trim() ? { notes: v.notes.trim() } : {}),
    };
    try {
      await this.api.invoke(createPurchase, { body });
      this.createOpen.set(false);
      await this.loadPurchases();
    } catch (e: any) {
      this.saveError.set(e?.error?.message ?? 'Error al registrar la compra');
    } finally {
      this.saving.set(false);
    }
  }

  async openDetail(purchase: PurchaseResponse): Promise<void> {
    this.detail.set(null);
    this.detailLoading.set(true);
    this.detailOpen.set(true);
    try {
      const raw = await this.api.invoke(getPurchase, { id: purchase.id! }) as unknown;
      this.detail.set(await parseBlob<PurchaseDetailResponse>(raw));
    } catch { /* stays empty */ }
    finally {
      this.detailLoading.set(false);
    }
  }

  closeDetail(): void {
    this.detailOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.createOpen()) this.closeCreate();
    else if (this.detailOpen()) this.closeDetail();
  }

  async goToPage(p: number): Promise<void> {
    this.page.set(p);
    await this.loadPurchases();
  }

  isItemInvalid(index: number, field: string): boolean {
    const ctrl = this.items.at(index).get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  formatARS(n?: number): string {
    if (n == null) return '—';
    return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatDate(s?: string): string {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
