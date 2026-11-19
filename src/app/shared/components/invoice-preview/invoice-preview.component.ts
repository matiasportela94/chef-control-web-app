import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../../api/api';
import { confirmChatInvoice } from '../../../api/fn/ai-chat-controller/confirm-chat-invoice';
import { uploadPurchaseAttachment } from '../../../api/fn/purchase-attachment-controller/upload-purchase-attachment';
import { getPurchase } from '../../../api/fn/purchase-controller/get-purchase';
import { listProducts } from '../../../api/fn/product-controller/list-products';
import { listSuppliers } from '../../../api/fn/supplier-controller/list-suppliers';
import { listUnits } from '../../../api/fn/unit-controller/list-units';
import { ChatResponse } from '../../../api/models/chat-response';
import { ConfirmChatInvoiceRequest } from '../../../api/models/confirm-chat-invoice-request';
import { InvoicePreview } from '../../../api/models/invoice-preview';
import { InvoiceWarning } from '../../../api/models/invoice-warning';
import { PagedResponseProductResponse } from '../../../api/models/paged-response-product-response';
import { ProductResponse } from '../../../api/models/product-response';
import { PurchaseDetailResponse } from '../../../api/models/purchase-detail-response';
import { SupplierResponse } from '../../../api/models/supplier-response';
import { UnitResponse } from '../../../api/models/unit-response';
import { I18nService } from '../../../core/services/i18n.service';
import { extractApiError } from '../../../core/utils/api-error';
import { formatARS, formatDate, formatNum } from '../../../core/utils/format';
import { IVA_RATES, formatIvaRate, ivaForLine } from '../../../core/utils/iva';
import { parseBlob } from '../../../core/utils/parse-blob';
import { DrawerComponent } from '../drawer/drawer.component';

type InvoiceType = 'A' | 'B' | 'C' | 'REMITO';

/** Lo que se edita de cada renglón. `productChoice`: el id de un insumo, 'new' (el que propone la IA) o '' (sin elegir). */
interface EditLine {
  key: number;
  printedText: string;
  printed: string;
  printedUnit: string;
  productChoice: string;
  newName: string;
  newUnitId: string;
  quantity: number | null;
  unitId: string;
  unitPrice: number | null;
  ivaPercentage: number;
  expirationDate: string;
  /** La unidad impresa no convierte a la del insumo ("1 BOLSA HARINA 25 KG"): hay que decir cuántas trae. */
  needsFactor: boolean;
  factor: number | null;
  warnings: string[];
}

const LINE_CODE = /^([A-Z_]+):\s*/;

/**
 * Vista previa de una factura o remito leído por el chat. Nada se registra hasta "Registrar compra": todo se puede
 * corregir (proveedor, tipo, número, fecha, IVA y, por renglón, el insumo, la cantidad, la unidad, el precio y la
 * alícuota). Al confirmar, los archivos se adjuntan a la compra.
 */
@Component({
  selector: 'app-invoice-preview',
  standalone: true,
  imports: [DrawerComponent, FormsModule],
  templateUrl: './invoice-preview.component.html',
  styleUrl: './invoice-preview.component.scss',
})
export class InvoicePreviewComponent {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  /** Se registró la compra: el chat suma la respuesta (con su Deshacer). */
  @Output() saved = new EventEmitter<ChatResponse>();

  step = signal<'edit' | 'saving' | 'uploading' | 'done'>('edit');
  error = signal<string | null>(null);
  uploadErrors = signal<string[]>([]);
  uploaded = signal(0);
  warnings = signal<InvoiceWarning[]>([]);
  printedTotal = signal<number | null>(null);
  /** "Ver la compra" de una factura ya cargada: el detalle, cargado a pedido. */
  existing = signal<Record<string, PurchaseDetailResponse | 'loading' | 'error'>>({});
  products = signal<ProductResponse[]>([]);
  units = signal<UnitResponse[]>([]);
  suppliers = signal<SupplierResponse[]>([]);
  files: File[] = [];

  header = { supplierChoice: '', newSupplierName: '', newSupplierCuit: '', invoiceType: '' as InvoiceType | '', invoiceNumber: '',
             issuedOn: '', pricesIncludeIva: true };
  lines: EditLine[] = [];

  readonly ivaRates = IVA_RATES;
  readonly invoiceTypes: InvoiceType[] = ['A', 'B', 'C', 'REMITO'];
  readonly formatARS = formatARS;
  readonly formatNum = formatNum;
  readonly formatIvaRate = formatIvaRate;
  readonly formatDate = formatDate;
  private nextKey = 0;

  constructor(private api: Api, private i18n: I18nService) {}

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  get busy(): boolean {
    return this.step() === 'saving' || this.step() === 'uploading';
  }

  /** `files`: los que se mandaron con el mensaje. Vacío si la factura vino del historial (se recargó la página). */
  async open(preview: InvoicePreview, files: File[]): Promise<void> {
    this.step.set('edit');
    this.error.set(null);
    this.uploadErrors.set([]);
    this.uploaded.set(0);
    this.existing.set({});
    this.files = files;
    this.warnings.set(preview.warnings ?? []);
    this.printedTotal.set(preview.printedTotal ?? null);
    const s = preview.supplier;
    this.header = {
      supplierChoice: s?.supplierId ?? (s?.name ? 'new' : ''),
      newSupplierName: s?.supplierId ? '' : s?.name ?? '',
      newSupplierCuit: s?.supplierId ? '' : s?.cuit ?? '',
      invoiceType: preview.invoiceType ?? '',
      invoiceNumber: preview.invoiceNumber ?? '',
      issuedOn: preview.issuedOn ?? '',
      pricesIncludeIva: preview.pricesIncludeIva ?? true,
    };
    this.lines = (preview.lines ?? []).map(l => {
      const codes = (l.warnings ?? []).map(w => w.match(LINE_CODE)?.[1]);
      return {
        key: this.nextKey++,
        printedText: l.printedText ?? '',
        printed: [l.printedQuantity, l.printedUnit].filter(x => x != null && x !== '').join(' '),
        printedUnit: l.printedUnit ?? '',
        productChoice: l.productId ?? (l.proposedProduct ? 'new' : ''),
        newName: l.proposedProduct?.name ?? '',
        newUnitId: l.proposedProduct?.unitId ?? l.unitId ?? '',
        quantity: l.quantity ?? null,
        unitId: l.unitId ?? '',
        unitPrice: l.unitPrice ?? null,
        ivaPercentage: l.ivaPercentage ?? 0,
        expirationDate: '',
        needsFactor: codes.includes('UNIT_NOT_CONVERTIBLE'),
        factor: null,
        warnings: (l.warnings ?? []).map(w => w.replace(LINE_CODE, '')),
      };
    });
    await this.loadCatalogs();
  }

  /** Una vez por apertura del shell: el catálogo, las unidades y los proveedores para elegir. */
  private async loadCatalogs(): Promise<void> {
    if (this.units().length) return;
    try {
      const [products, units, suppliers] = await Promise.all([
        parseBlob<PagedResponseProductResponse>(await this.api.invoke(listProducts, { page: 0, size: 999 }) as unknown),
        parseBlob<UnitResponse[]>(await this.api.invoke(listUnits) as unknown),
        parseBlob<SupplierResponse[]>(await this.api.invoke(listSuppliers) as unknown),
      ]);
      const byName = (a: { name?: string }, b: { name?: string }) => (a.name ?? '').localeCompare(b.name ?? '', 'es');
      this.products.set((products.content ?? []).filter(p => p.isActive !== false).sort(byName));
      this.units.set(units);
      this.suppliers.set([...suppliers].sort(byName));
    } catch (e) {
      this.error.set(extractApiError(e, this.t('invoice.loadError')));
    }
  }

  close(): void {
    if (this.busy) return;
    this.closed.emit();
  }

  removeLine(line: EditLine): void {
    this.lines = this.lines.filter(l => l.key !== line.key);
  }

  unitAbbr(unitId: string): string {
    return this.units().find(u => u.id === unitId)?.abbreviation ?? '';
  }

  /** La unidad en la que va el insumo (la del catálogo, o la elegida para uno nuevo). */
  targetUnitId(l: EditLine): string {
    if (l.productChoice === 'new') return l.newUnitId;
    return this.products().find(p => p.id === l.productChoice)?.defaultUnit?.id ?? '';
  }

  /**
   * Lo que se registra. Si la unidad impresa no convierte ("2 BOLSA HARINA X 25 KG"), el back guarda el renglón tal como
   * llega y usa el factor solo para aprenderlo: la cuenta la hace el front. 2 bolsas de 25 kg a $ 20.000 → 50 kg a $ 800.
   */
  converted(l: EditLine): { quantity: number; unitId: string; unitPrice: number } | null {
    if (!l.quantity || l.unitPrice == null) return null;
    const target = this.targetUnitId(l);
    if (!l.needsFactor || !l.factor || l.factor <= 0 || !target) return { quantity: l.quantity, unitId: l.unitId, unitPrice: l.unitPrice };
    return { quantity: Math.round(l.quantity * l.factor * 1000) / 1000, unitId: target,
             unitPrice: Math.round(l.unitPrice / l.factor * 10000) / 10000 };
  }

  /** Total con lo editado y la regla de redondeo del back (ivaForLine): neto + IVA de cada renglón. */
  total(): number {
    return this.lines.reduce((sum, l) => {
      if (!l.quantity || l.unitPrice == null) return sum;
      const { net, iva } = ivaForLine(l.quantity, l.unitPrice, l.ivaPercentage, this.header.pricesIncludeIva);
      return sum + net + iva;
    }, 0);
  }

  totalDiffers(): boolean {
    const printed = this.printedTotal();
    return printed != null && Math.abs(printed - this.total()) >= 0.01;
  }

  lineProblem(l: EditLine): string | null {
    if (!l.productChoice) return this.t('invoice.missing.product');
    if (l.productChoice === 'new' && (!l.newName.trim() || !l.newUnitId)) return this.t('invoice.missing.newProduct');
    if (!l.quantity || l.quantity <= 0) return this.t('invoice.missing.quantity');
    if (!l.unitId) return this.t('invoice.missing.unit');
    if (l.unitPrice == null || l.unitPrice < 0) return this.t('invoice.missing.price');
    if (l.needsFactor && (!l.factor || l.factor <= 0)) return this.t('invoice.missing.factor');
    return null;
  }

  canConfirm(): boolean {
    const h = this.header;
    const supplierOk = !!h.supplierChoice && (h.supplierChoice !== 'new' || !!h.newSupplierName.trim());
    return this.step() === 'edit' && supplierOk && this.lines.length > 0 && this.lines.every(l => !this.lineProblem(l));
  }

  async showExisting(purchaseId: string | undefined): Promise<void> {
    if (!purchaseId || this.existing()[purchaseId]) return;
    this.existing.update(x => ({ ...x, [purchaseId]: 'loading' }));
    try {
      const p = await parseBlob<PurchaseDetailResponse>(await this.api.invoke(getPurchase, { id: purchaseId }) as unknown);
      this.existing.update(x => ({ ...x, [purchaseId]: p }));
    } catch {
      this.existing.update(x => ({ ...x, [purchaseId]: 'error' }));
    }
  }

  existingOf(id: string | undefined): PurchaseDetailResponse | 'loading' | 'error' | undefined {
    return id ? this.existing()[id] : undefined;
  }

  async confirm(): Promise<void> {
    if (!this.canConfirm()) return;
    const h = this.header;
    const isNewSupplier = h.supplierChoice === 'new';
    const body: ConfirmChatInvoiceRequest = {
      supplierId: isNewSupplier ? undefined : h.supplierChoice,
      newSupplierName: isNewSupplier ? h.newSupplierName.trim() : undefined,
      newSupplierCuit: isNewSupplier && h.newSupplierCuit.trim() ? h.newSupplierCuit.trim() : undefined,
      invoiceType: h.invoiceType || undefined,
      invoiceNumber: h.invoiceNumber.trim() || undefined,
      issuedOn: h.issuedOn || undefined,
      pricesIncludeIva: h.pricesIncludeIva,
      lines: this.lines.map(l => ({
        printedText: l.printedText || undefined,
        productId: l.productChoice === 'new' ? undefined : l.productChoice,
        newProductName: l.productChoice === 'new' ? l.newName.trim() : undefined,
        newProductUnitId: l.productChoice === 'new' ? l.newUnitId : undefined,
        ...this.converted(l)!,
        ivaPercentage: l.ivaPercentage,
        expirationDate: l.expirationDate || undefined,
        unitsPerPrintedUnit: l.needsFactor ? l.factor ?? undefined : undefined,
      })),
    };
    this.step.set('saving');
    this.error.set(null);
    let res: ChatResponse;
    try {
      res = await parseBlob<ChatResponse>(await this.api.invoke(confirmChatInvoice, { body }) as unknown);
    } catch (e) {
      this.error.set(extractApiError(e, this.t('invoice.saveError')));
      this.step.set('edit');
      return;
    }
    const purchaseId = res.status === 'REGISTERED' ? res.actions?.[0]?.entityId : undefined;
    if (!purchaseId) {
      // No se registró (un permiso, un insumo que ya no existe…): el back explica por qué en el message.
      this.error.set(res.message ?? this.t('invoice.saveError'));
      this.step.set('edit');
      return;
    }
    this.saved.emit(res);
    await this.uploadFiles(purchaseId);
    this.step.set('done');
  }

  /** De a uno, como pide el back. Un archivo que falla no frena a los demás: la compra ya quedó registrada. */
  private async uploadFiles(purchaseId: string): Promise<void> {
    if (!this.files.length) return;
    this.step.set('uploading');
    const errors: string[] = [];
    for (const file of this.files) {
      try {
        await this.api.invoke(uploadPurchaseAttachment, { purchaseId, body: { file } });
        this.uploaded.update(n => n + 1);
      } catch (e) {
        errors.push(`${file.name}: ${extractApiError(e, this.t('invoice.uploadError'))}`);
      }
    }
    this.uploadErrors.set(errors);
  }
}
