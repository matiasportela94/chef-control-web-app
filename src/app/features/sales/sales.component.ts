import { Component, HostListener, OnInit, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed }      from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api }                     from '../../api/api';
import { AiRefreshService }        from '../../core/services/ai-refresh.service';
import { AlertNotificationService } from '../../core/services/alert-notification.service';
import { listSales }               from '../../api/fn/sale-controller/list-sales';
import { createSale }              from '../../api/fn/sale-controller/create-sale';
import { getSale }                 from '../../api/fn/sale-controller/get-sale';
import { reverseSale }             from '../../api/fn/sale-controller/reverse-sale';
import { listSaleAttachments }     from '../../api/fn/sale-attachment-controller/list-sale-attachments';
import { getSaleAttachment }       from '../../api/fn/sale-attachment-controller/get-sale-attachment';
import { uploadSaleAttachment }    from '../../api/fn/sale-attachment-controller/upload-sale-attachment';
import { deleteSaleAttachment }    from '../../api/fn/sale-attachment-controller/delete-sale-attachment';
import { SaleAttachmentResponse }  from '../../api/models/sale-attachment-response';
import { AuthService }             from '../../core/services/auth.service';
import { I18nService }             from '../../core/services/i18n.service';
import { ActionDialogComponent }   from '../../shared/components/action-dialog/action-dialog.component';
import { listMenuItems }           from '../../api/fn/menu-item-controller/list-menu-items';
import { SaleResponse }            from '../../api/models/sale-response';
import { MenuItemResponse }        from '../../api/models/menu-item-response';
import { PagedResponseSaleResponse } from '../../api/models/paged-response-sale-response';
import { PagedResponseMenuItemResponse } from '../../api/models/paged-response-menu-item-response';
import { parseBlob }               from '../../core/utils/parse-blob';
import { formatARS, formatDate }   from '../../core/utils/format';
import { arToday, arDateOf, arDayStart } from '../../core/utils/date';
import { extractApiError }         from '../../core/utils/api-error';
import { PaginatorComponent }      from '../../shared/components/paginator/paginator.component';
import { DrawerComponent }         from '../../shared/components/drawer/drawer.component';
import { SpinnerComponent }        from '../../shared/components/spinner/spinner.component';
import { SelectComponent, SelectOption } from '../../shared/components/select/select.component';

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [ReactiveFormsModule, PaginatorComponent, DrawerComponent, SpinnerComponent, SelectComponent, ActionDialogComponent],
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

  menuItemOptions = computed<SelectOption[]>(() =>
    this.menuItems().map(m => ({ value: m.id ?? '', label: m.price ? `${m.name} · ${formatARS(m.price)}` : (m.name ?? '') }))
  );

  createOpen = signal(false);
  saving     = signal(false);
  saveError  = signal<string | null>(null);

  detailOpen    = signal(false);
  detail        = signal<SaleResponse | null>(null);
  detailLoading = signal(false);

  readonly canManageAttachments = computed(() => this.auth.hasPermission('SALES_CREATE'));
  attachments        = signal<SaleAttachmentResponse[]>([]);
  attachmentsLoading = signal(false);
  attachmentBusy     = signal(false);
  attachmentError    = signal<string | null>(null);
  deletingAttachment = signal<SaleAttachmentResponse | null>(null);

  reverseModalOpen = signal(false);
  reverseTarget    = signal<SaleResponse | null>(null);
  reverseTargetId  = signal<string | null>(null);
  reverseLoading   = signal(false);
  reversing        = signal(false);
  reverseError     = signal<string | null>(null);

  form: FormGroup;

  constructor(private api: Api, private fb: FormBuilder, private aiRefresh: AiRefreshService, private alertNotification: AlertNotificationService, private auth: AuthService, private i18n: I18nService) {
    this.form = this.fb.group({
      soldAt: [arToday()],
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
    if (this.sales().length === 0) this.loading.set(true); // evita el flash de spinner (y el salto de scroll) en recargas tras crear/editar/borrar
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
    this.form.reset({ soldAt: arToday(), notes: '' });
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
      // Medianoche argentina: a las 00:00 UTC la venta caía en el día anterior (21 h) y así se mostraba.
      ...(v.soldAt       ? { soldAt: arDayStart(v.soldAt) }   : {}),
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
    // Se lee antes de cerrar el modal: closeReverseModal() lo borra, y leído después el form precargado no se abría nunca.
    const target = this.reverseTarget();
    try {
      await this.api.invoke(reverseSale, { id });
      this.closeReverseModal();
      await this.loadSales();
      void this.alertNotification.refresh();
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
    const soldDate = d.soldAt ? arDateOf(d.soldAt) : arToday();
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
    this.attachments.set([]);
    this.attachmentError.set(null);
    void this.loadAttachments(sale.id!);
    try {
      const raw = await this.api.invoke(getSale, { id: sale.id! }) as unknown;
      this.detail.set(await parseBlob<SaleResponse>(raw));
    } catch { /* stays empty */ }
    finally {
      this.detailLoading.set(false);
    }
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  async loadAttachments(saleId: string): Promise<void> {
    this.attachmentsLoading.set(true);
    try {
      const raw = await this.api.invoke(listSaleAttachments, { saleId }) as unknown;
      if (this.detailOpen()) this.attachments.set(await parseBlob<SaleAttachmentResponse[]>(raw));
    } catch { this.attachments.set([]); }
    finally { this.attachmentsLoading.set(false); }
  }

  /** Baja el archivo y lo abre en otra pestaña; la URL se libera pasado un rato. */
  async openAttachment(a: SaleAttachmentResponse): Promise<void> {
    const saleId = this.detail()?.id;
    if (!saleId || !a.id) return;
    this.attachmentError.set(null);
    // Se abre antes del await: los navegadores bloquean un popup abierto fuera del gesto del usuario.
    const win = window.open('', '_blank');
    try {
      const raw = await this.api.invoke(getSaleAttachment, { saleId, attachmentId: a.id }) as unknown;
      const blob = raw instanceof Blob ? raw : new Blob([raw as BlobPart]);
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      win?.close();
      this.attachmentError.set(extractApiError(e, this.t('sales.attachmentOpenError')));
    }
  }

  async onAttachmentFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const saleId = this.detail()?.id;
    if (!file || !saleId) return;
    if (file.size > 4 * 1024 * 1024) { this.attachmentError.set(this.t('sales.attachmentTooLarge')); return; }
    this.attachmentBusy.set(true);
    this.attachmentError.set(null);
    try {
      await this.api.invoke(uploadSaleAttachment, { saleId, body: { file } });
      await this.loadAttachments(saleId);
    } catch (e: any) {
      this.attachmentError.set(extractApiError(e, this.t('sales.attachmentUploadError')));
    } finally { this.attachmentBusy.set(false); }
  }

  async confirmDeleteAttachment(): Promise<void> {
    const a = this.deletingAttachment();
    const saleId = this.detail()?.id;
    if (!a?.id || !saleId) return;
    this.attachmentBusy.set(true);
    try {
      await this.api.invoke(deleteSaleAttachment, { saleId, attachmentId: a.id });
      this.deletingAttachment.set(null);
      await this.loadAttachments(saleId);
    } catch (e: any) {
      this.deletingAttachment.set(null);
      this.attachmentError.set(extractApiError(e, this.t('sales.attachmentDeleteError')));
    } finally { this.attachmentBusy.set(false); }
  }

  formatSize(bytes?: number): string {
    const b = bytes ?? 0;
    return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`
                           : `${Math.max(1, Math.round(b / 1024)).toLocaleString('es-AR')} KB`;
  }

  closeDetail(): void {
    this.detailOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.deletingAttachment()) this.deletingAttachment.set(null);
    else if (this.reverseModalOpen()) this.closeReverseModal();
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
