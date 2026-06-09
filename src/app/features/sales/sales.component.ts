import { Component, HostListener, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api } from '../../api/api';
import { list1 as listSales }      from '../../api/fn/sale-controller/list-1';
import { create1 as createSale }   from '../../api/fn/sale-controller/create-1';
import { get2 as getSale }         from '../../api/fn/sale-controller/get-2';
import { list2 as listMenuItems }  from '../../api/fn/menu-item-controller/list-2';
import { SaleResponse }            from '../../api/models/sale-response';
import { MenuItemResponse }        from '../../api/models/menu-item-response';
import { PagedResponseSaleResponse }     from '../../api/models/paged-response-sale-response';
import { PagedResponseMenuItemResponse } from '../../api/models/paged-response-menu-item-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatARS, formatDate } from '../../core/utils/format';
import { todayISO } from '../../core/utils/date';
import { extractApiError } from '../../core/utils/api-error';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [ReactiveFormsModule, PaginatorComponent, DrawerComponent, SpinnerComponent],
  templateUrl: './sales.component.html',
  styleUrl: './sales.component.scss'
})
export class SalesComponent implements OnInit {
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

  form: FormGroup;

  constructor(private api: Api, private fb: FormBuilder) {
    this.form = this.fb.group({
      soldAt: [todayISO()],
      notes:  [''],
      items:  this.fb.array([], Validators.minLength(1)),
    });
  }

  async ngOnInit(): Promise<void> {
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
      ...(v.soldAt       ? { soldAt: v.soldAt }         : {}),
      ...(v.notes?.trim() ? { notes: v.notes.trim() }   : {}),
    };
    try {
      await this.api.invoke(createSale, { body });
      this.createOpen.set(false);
      await this.loadSales();
    } catch (e: any) {
      this.saveError.set(extractApiError(e, 'Error al registrar la venta'));
    } finally {
      this.saving.set(false);
    }
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
    if (this.createOpen()) this.closeCreate();
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
