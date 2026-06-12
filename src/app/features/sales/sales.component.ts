import { Component, HostListener, OnInit, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api } from '../../api/api';
import { AiRefreshService } from '../../core/services/ai-refresh.service';
import { AlertNotificationService } from '../../core/services/alert-notification.service';
import { list1 as listSales }      from '../../api/fn/sale-controller/list-1';
import { create1 as createSale }   from '../../api/fn/sale-controller/create-1';
import { get2 as getSale }         from '../../api/fn/sale-controller/get-2';
import { reverseSale }             from '../../api/fn/sale-controller/reverse-sale';
import { list2 as listMenuItems }  from '../../api/fn/menu-item-controller/list-2';
import { SaleResponse }            from '../../api/models/sale-response';
import { MenuItemResponse }        from '../../api/models/menu-item-response';
import { PagedResponseSaleResponse }     from '../../api/models/paged-response-sale-response';
import { PagedResponseMenuItemResponse } from '../../api/models/paged-response-menu-item-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatARS, formatDate } from '../../core/utils/format';
import { todayISO, dateToInstant } from '../../core/utils/date';
import { extractApiError } from '../../core/utils/api-error';
import { NgClass } from '@angular/common';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [ReactiveFormsModule, NgClass, PaginatorComponent, DrawerComponent, SpinnerComponent],
  templateUrl: './sales.component.html',
  styleUrl: './sales.component.scss'
})
export class SalesComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  sales    = signal<SaleResponse[]>([]);
  loading  = signal(true);
  error    = signal<string | null>(null);
  page     = signal(1);
  pageSize = 20;
  total    = signal(0);

  menuItems = signal<MenuItemResponse[]>([]);

  createOpen = signal(false);
  saving     = signal(false);
  saveError  = signal<string | null>(null);

  detailOpen    = signal(false);
  detail        = signal<SaleResponse | null>(null);
  detailLoading = signal(false);

  reverseModalOpen = signal(false);
  reverseTarget    = signal<SaleResponse | null>(null);
  reverseTargetId  = signal<string | null>(null);
  reverseLoading   = signal(false);
  reversing        = signal(false);
  reverseError     = signal<string | null>(null);

  form: FormGroup;

  constructor(private api: Api, private fb: FormBuilder, private aiRefresh: AiRefreshService, private alertNotification: AlertNotificationService) {
    this.form = this.fb.group({
      soldAt: [todayISO()],
      notes:  [''],
      items:  this.fb.array([], Validators.minLength(1)),
    });
  }

  async ngOnInit(): Promise<void> {
    this.aiRefresh.executed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.loadSales());
    await Promise.all([this.loadSales(), this.loadMenuItems()]);
  }

  get items(): FormArray {
    return this.form.get('items') as FormArray;
  }

  async loadSales(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.invoke(listSales, { page: this.page() - 1, size: this.pageSize }) as unknown;
      const res = await parseBlob<PagedResponseSaleResponse>(raw);
      this.sales.set(res.content ?? []);
      this.total.set(res.totalElements ?? 0);
    } catch {
      this.error.set('No se pudieron cargar las ventas.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadMenuItems(): Promise<void> {
    try {
      const raw = await this.api.invoke(listMenuItems, { page: 0, size: 999 }) as unknown;
      const res = await parseBlob<PagedResponseMenuItemResponse>(raw);
      this.menuItems.set((res.content ?? []).filter(m => m.active));
    } catch { /* non-critical */ }
  }

  openCreate(): void {
    this.items.clear();
    this.form.reset({ soldAt: todayISO(), notes: '' });
    this.addItem();
    this.saveError.set(null);
    this.createOpen.set(true);
  }

  closeCreate(): void {
    this.createOpen.set(false);
  }

  private newItemGroup(): FormGroup {
    return this.fb.group({
      menuItemId: ['', Validators.required],
      quantity:   [1,  [Validators.required, Validators.min(1)]],
    });
  }

  addItem(): void {
    this.items.push(this.newItemGroup());
  }

  removeItem(index: number): void {
    this.items.removeAt(index);
  }

  menuItemPrice(index: number): number | null {
    const id = this.items.at(index).get('menuItemId')?.value;
    return this.menuItems().find(m => m.id === id)?.price ?? null;
  }

  lineTotal(index: number): number | null {
    const price = this.menuItemPrice(index);
    if (price == null) return null;
    const qty = +(this.items.at(index).get('quantity')?.value) || 0;
    return price * qty;
  }

  get grandTotal(): number {
    return this.items.controls.reduce((sum, _, i) => {
      return sum + (this.lineTotal(i) ?? 0);
    }, 0);
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      if (this.items.length === 0) this.saveError.set('Agregá al menos un plato.');
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    const v = this.form.getRawValue();
    const body = {
      items: v.items.map((i: any) => ({
        menuItemId: i.menuItemId,
        quantity:   +i.quantity,
      })),
      ...(v.soldAt       ? { soldAt: dateToInstant(v.soldAt) }   : {}),
      ...(v.notes?.trim() ? { notes: v.notes.trim() }   : {}),
    };
    try {
      await this.api.invoke(createSale, { body });
      this.createOpen.set(false);
      await this.loadSales();
      void this.alertNotification.refresh();
    } catch (e: any) {
      this.saveError.set(extractApiError(e, 'Error al registrar la venta'));
    } finally {
      this.saving.set(false);
    }
  }

  async openReverseModal(sale: SaleResponse): Promise<void> {
    this.reverseTarget.set(null);
    this.reverseTargetId.set(sale.id ?? null);
    this.reverseError.set(null);
    this.reverseLoading.set(true);
    this.reverseModalOpen.set(true);
    try {
      const raw = await this.api.invoke(getSale, { id: sale.id! }) as unknown;
      this.reverseTarget.set(await parseBlob<SaleResponse>(raw));
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
      await this.api.invoke(reverseSale, { id });
      this.closeReverseModal();
      await this.loadSales();
      void this.alertNotification.refresh();
      const target = this.reverseTarget();
      if (target) this.openCreatePrefilled(target);
    } catch (e: any) {
      this.reverseError.set(extractApiError(e, 'Error al revertir la venta'));
    } finally {
      this.reversing.set(false);
    }
  }

  private openCreatePrefilled(d: SaleResponse): void {
    this.items.clear();
    this.saveError.set(null);
    const soldDate = d.soldAt
      ? new Date(d.soldAt).toISOString().substring(0, 10)
      : todayISO();
    this.form.reset({ soldAt: soldDate, notes: d.notes ?? '' });
    if (d.items) {
      for (const item of d.items) {
        this.items.push(this.fb.group({
          menuItemId: [item.menuItemId ?? '', Validators.required],
          quantity:   [item.quantity  ?? 1,  [Validators.required, Validators.min(1)]],
        }));
      }
    }
    this.createOpen.set(true);
  }

  async openDetail(sale: SaleResponse): Promise<void> {
    this.detail.set(null);
    this.detailLoading.set(true);
    this.detailOpen.set(true);
    try {
      const raw = await this.api.invoke(getSale, { id: sale.id! }) as unknown;
      this.detail.set(await parseBlob<SaleResponse>(raw));
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
    if (this.reverseModalOpen()) this.closeReverseModal();
    else if (this.createOpen()) this.closeCreate();
    else if (this.detailOpen()) this.closeDetail();
  }

  async goToPage(p: number): Promise<void> {
    this.page.set(p);
    await this.loadSales();
  }

  isItemInvalid(index: number, field: string): boolean {
    const ctrl = this.items.at(index).get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  readonly formatARS = formatARS;
  readonly formatDate = formatDate;
}
