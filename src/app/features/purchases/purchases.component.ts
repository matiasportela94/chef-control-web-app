import { Component, HostListener, OnInit, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api } from '../../api/api';
import { AiRefreshService } from '../../core/services/ai-refresh.service';
import { listPurchases }  from '../../api/fn/purchase-controller/list-purchases';
import { createPurchase } from '../../api/fn/purchase-controller/create-purchase';
import { updatePurchase }  from '../../api/fn/purchase-controller/update-purchase';
import { reversePurchase } from '../../api/fn/purchase-controller/reverse-purchase';
import { getPurchase }     from '../../api/fn/purchase-controller/get-purchase';
import { listProducts }   from '../../api/fn/product-controller/list-products';
import { listSuppliers }  from '../../api/fn/supplier-controller/list-suppliers';
import { listUnits }      from '../../api/fn/unit-controller/list-units';
import { PurchaseResponse }           from '../../api/models/purchase-response';
import { PurchaseDetailResponse }     from '../../api/models/purchase-detail-response';
import { ProductResponse }            from '../../api/models/product-response';
import { SupplierResponse }           from '../../api/models/supplier-response';
import { UnitResponse }               from '../../api/models/unit-response';
import { PagedResponsePurchaseResponse }  from '../../api/models/paged-response-purchase-response';
import { PagedResponseProductResponse }  from '../../api/models/paged-response-product-response';
import { DecimalPipe, NgClass } from '@angular/common';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatARS, formatDate } from '../../core/utils/format';
import { todayISO, dateToInstant } from '../../core/utils/date';
import { extractApiError } from '../../core/utils/api-error';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';

@Component({
  selector: 'app-purchases',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe, NgClass, PaginatorComponent, DrawerComponent, SpinnerComponent],
  templateUrl: './purchases.component.html',
  styleUrl: './purchases.component.scss'
})
export class PurchasesComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

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
  editMode   = signal(false);
  editingId  = signal<string | null>(null);
  saving     = signal(false);
  saveError  = signal<string | null>(null);

  detailOpen    = signal(false);
  detail        = signal<PurchaseDetailResponse | null>(null);
  detailLoading = signal(false);

  reverseModalOpen   = signal(false);
  reverseTarget      = signal<PurchaseDetailResponse | null>(null);
  reverseTargetId    = signal<string | null>(null);
  reverseLoading     = signal(false);
  reversing          = signal(false);
  reverseError       = signal<string | null>(null);

  form: FormGroup;

  constructor(private api: Api, private fb: FormBuilder, private aiRefresh: AiRefreshService) {
    this.form = this.fb.group({
      purchasedAt: [todayISO()],
      supplierId:  [''],
      notes:       [''],
      items:       this.fb.array([], Validators.minLength(1)),
    });
  }

  async ngOnInit(): Promise<void> {
    this.aiRefresh.executed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.loadPurchases());
    await Promise.all([this.loadPurchases(), this.loadFormData()]);
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
    } catch { /* non-critical */ }
  }

  openCreate(): void {
    this.editMode.set(false);
    this.editingId.set(null);
    this.items.clear();
    this.form.reset({ purchasedAt: todayISO(), supplierId: '', notes: '' });
    this.addItem();
    this.saveError.set(null);
    this.createOpen.set(true);
  }

  async openEdit(purchase: PurchaseResponse): Promise<void> {
    this.editMode.set(true);
    this.editingId.set(purchase.id ?? null);
    this.items.clear();
    this.saveError.set(null);

    // Load detail to get items
    let d: PurchaseDetailResponse | null = null;
    try {
      const raw = await this.api.invoke(getPurchase, { id: purchase.id! }) as unknown;
      d = await parseBlob<PurchaseDetailResponse>(raw);
    } catch { /* stays null */ }

    const purchasedDate = purchase.purchasedAt
      ? new Date(purchase.purchasedAt).toISOString().substring(0, 10)
      : todayISO();

    this.form.patchValue({
      purchasedAt: purchasedDate,
      supplierId:  purchase.supplierId ?? '',
      notes:       purchase.notes ?? '',
    });

    if (d?.items) {
      for (const item of d.items) {
        const group = this.fb.group({
          itemId:       [item.id],
          productId:    [{ value: item.productId ?? '', disabled: true }],
          unitId:       [{ value: item.unitId    ?? '', disabled: true }],
          quantity:     [{ value: item.quantity  ?? 0,  disabled: true }],
          pricePerUnit: [item.pricePerUnit ?? null, [Validators.required, Validators.min(0.01)]],
          expirationDate: [{ value: null, disabled: true }],
          // display helpers
          _productName: [item.productName ?? ''],
          _unitAbbr:    [item.unitAbbreviation ?? ''],
        });
        this.items.push(group);
      }
    }

    this.createOpen.set(true);
  }

  closeCreate(): void {
    this.createOpen.set(false);
    this.editMode.set(false);
    this.editingId.set(null);
  }

  private newItemGroup(): FormGroup {
    return this.fb.group({
      itemId:         [null],
      productId:      ['', Validators.required],
      unitId:         ['', Validators.required],
      quantity:       [null as number | null, [Validators.required, Validators.min(0.001)]],
      pricePerUnit:   [null as number | null, [Validators.required, Validators.min(0.01)]],
      expirationDate: [null as string | null],
      _productName:   [''],
      _unitAbbr:      [''],
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
    if (this.editMode()) {
      await this.saveEdit();
    } else {
      await this.saveCreate();
    }
  }

  private async saveCreate(): Promise<void> {
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
      ...(v.purchasedAt ? { purchasedAt: dateToInstant(v.purchasedAt) } : {}),
      ...(v.supplierId  ? { supplierId:  v.supplierId  } : {}),
      ...(v.notes?.trim() ? { notes: v.notes.trim() } : {}),
    };
    try {
      await this.api.invoke(createPurchase, { body });
      this.createOpen.set(false);
      await this.loadPurchases();
    } catch (e: any) {
      this.saveError.set(extractApiError(e, 'Error al registrar la compra'));
    } finally {
      this.saving.set(false);
    }
  }

  private async saveEdit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    const v = this.form.getRawValue();
    const body: any = {
      supplierId:  v.supplierId  || null,
      notes:       v.notes?.trim() || null,
      purchasedAt: v.purchasedAt ? dateToInstant(v.purchasedAt) : null,
      items: v.items
        .filter((item: any) => item.itemId)
        .map((item: any) => ({
          id:           item.itemId,
          pricePerUnit: +item.pricePerUnit,
        })),
    };
    try {
      await this.api.invoke(updatePurchase, { id: this.editingId()!, body });
      this.closeCreate();
      await this.loadPurchases();
      // Refresh detail if open
      if (this.detailOpen() && this.detail()?.id === this.editingId()) {
        const raw = await this.api.invoke(getPurchase, { id: this.editingId()! }) as unknown;
        this.detail.set(await parseBlob<PurchaseDetailResponse>(raw));
      }
    } catch (e: any) {
      this.saveError.set(extractApiError(e, 'Error al actualizar la compra'));
    } finally {
      this.saving.set(false);
    }
  }

  async openReverseModal(purchase: PurchaseResponse): Promise<void> {
    this.reverseTarget.set(null);
    this.reverseTargetId.set(purchase.id ?? null);
    this.reverseError.set(null);
    this.reverseLoading.set(true);
    this.reverseModalOpen.set(true);
    try {
      const raw = await this.api.invoke(getPurchase, { id: purchase.id! }) as unknown;
      this.reverseTarget.set(await parseBlob<PurchaseDetailResponse>(raw));
    } catch { /* modal shows loading state */ }
    finally {
      this.reverseLoading.set(false);
    }
  }

  closeReverseModal(): void {
    this.reverseModalOpen.set(false);
    this.reverseTargetId.set(null);
    this.reverseTarget.set(null);
  }

  async confirmReverse(): Promise<void> {
    const id = this.reverseTargetId();
    if (!id) return;
    this.reversing.set(true);
    this.reverseError.set(null);
    try {
      await this.api.invoke(reversePurchase, { id });
      this.closeReverseModal();
      await this.loadPurchases();
      // Pre-fill the create form with the original data for correction
      const target = this.reverseTarget();
      if (target) this.openCreatePrefilled(target);
    } catch (e: any) {
      this.reverseError.set(extractApiError(e, 'Error al revertir la compra'));
    } finally {
      this.reversing.set(false);
    }
  }

  private openCreatePrefilled(d: PurchaseDetailResponse): void {
    this.editMode.set(false);
    this.editingId.set(null);
    this.items.clear();
    this.saveError.set(null);

    const purchasedDate = d.purchasedAt
      ? new Date(d.purchasedAt).toISOString().substring(0, 10)
      : todayISO();

    this.form.reset({
      purchasedAt: purchasedDate,
      supplierId:  d.supplierId ?? '',
      notes:       d.notes ?? '',
    });

    if (d.items) {
      for (const item of d.items) {
        this.items.push(this.fb.group({
          itemId:         [null],
          productId:      [item.productId ?? '', Validators.required],
          unitId:         [item.unitId    ?? '', Validators.required],
          quantity:       [item.quantity  ?? null, [Validators.required, Validators.min(0.001)]],
          pricePerUnit:   [item.pricePerUnit ?? null, [Validators.required, Validators.min(0.01)]],
          expirationDate: [null],
          _productName:   [item.productName ?? ''],
          _unitAbbr:      [item.unitAbbreviation ?? ''],
        }));
      }
    }
    this.createOpen.set(true);
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

  readonly formatARS = formatARS;
  readonly formatDate = formatDate;
}
