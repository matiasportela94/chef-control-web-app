import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../../api/api';
import { confirmChatSalesReport } from '../../../api/fn/ai-chat-controller/confirm-chat-sales-report';
import { uploadSaleAttachment } from '../../../api/fn/sale-attachment-controller/upload-sale-attachment';
import { getSale } from '../../../api/fn/sale-controller/get-sale';
import { listMenuItems } from '../../../api/fn/menu-item-controller/list-menu-items';
import { ChatResponse } from '../../../api/models/chat-response';
import { ConfirmChatSalesReportRequest } from '../../../api/models/confirm-chat-sales-report-request';
import { ExistingSales } from '../../../api/models/existing-sales';
import { MenuItemResponse } from '../../../api/models/menu-item-response';
import { PagedResponseMenuItemResponse } from '../../../api/models/paged-response-menu-item-response';
import { SaleResponse } from '../../../api/models/sale-response';
import { SalesReportPreview } from '../../../api/models/sales-report-preview';
import { SalesReportWarning } from '../../../api/models/sales-report-warning';
import { I18nService } from '../../../core/services/i18n.service';
import { extractApiError } from '../../../core/utils/api-error';
import { formatARS, formatDate } from '../../../core/utils/format';
import { parseBlob } from '../../../core/utils/parse-blob';
import { DrawerComponent } from '../drawer/drawer.component';

/** Un renglón del cierre. `dish`: el id de un plato, 'ignore' ("No es un plato", queda aprendido) o '' (sin elegir). */
interface EditLine {
  key: number;
  printedText: string;
  dish: string;
  quantity: number | null;
  unitPrice: number | null;
  menuPrice: number | null;
  warnings: string[];
}

const LINE_CODE = /^([A-Z_]+):\s*/;

/**
 * Vista previa de un cierre de caja (Z) leído por el chat. Nada se registra hasta confirmar. Un Z nunca da de alta
 * platos: un renglón que no está en la carta se asigna a uno del catálogo o se marca "No es un plato".
 */
@Component({
  selector: 'app-sales-report-preview',
  standalone: true,
  imports: [DrawerComponent, FormsModule],
  templateUrl: './sales-report-preview.component.html',
  styleUrl: '../invoice-preview/invoice-preview.component.scss',
})
export class SalesReportPreviewComponent {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<ChatResponse>();

  step = signal<'edit' | 'saving' | 'uploading' | 'done'>('edit');
  error = signal<string | null>(null);
  uploadErrors = signal<string[]>([]);
  uploaded = signal(0);
  warnings = signal<SalesReportWarning[]>([]);
  printedTotal = signal<number | null>(null);
  existingSales = signal<ExistingSales | null>(null);
  existing = signal<Record<string, SaleResponse | 'loading' | 'error'>>({});
  dishes = signal<MenuItemResponse[]>([]);
  showIgnored = signal(false);
  files: File[] = [];

  header = { reportNumber: '', soldOn: '', existingSales: '' as '' | 'REVERSE' | 'ADD' };
  lines: EditLine[] = [];

  readonly formatARS = formatARS;
  readonly formatDate = formatDate;
  private nextKey = 0;

  constructor(private api: Api, private i18n: I18nService) {}

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  get busy(): boolean {
    return this.step() === 'saving' || this.step() === 'uploading';
  }

  get activeLines(): EditLine[] { return this.lines.filter(l => l.dish !== 'ignore'); }
  get ignoredLines(): EditLine[] { return this.lines.filter(l => l.dish === 'ignore'); }

  async open(preview: SalesReportPreview, files: File[]): Promise<void> {
    this.step.set('edit');
    this.error.set(null);
    this.uploadErrors.set([]);
    this.uploaded.set(0);
    this.existing.set({});
    this.showIgnored.set(false);
    this.files = files;
    this.warnings.set(preview.warnings ?? []);
    this.printedTotal.set(preview.printedTotal ?? null);
    this.existingSales.set(preview.existingSales ?? null);
    // Sin opción por defecto: revertir o sumar ventas ya cargadas lo decide la persona.
    this.header = { reportNumber: preview.reportNumber ?? '', soldOn: preview.soldOn ?? '', existingSales: '' };
    this.lines = (preview.lines ?? []).map(l => ({
      key: this.nextKey++,
      printedText: l.printedText ?? '',
      dish: l.matchedBy === 'IGNORED' ? 'ignore' : l.menuItemId ?? '',
      quantity: l.quantity ?? null,
      unitPrice: l.unitPrice ?? null,
      menuPrice: l.priceDiffers ? l.menuPrice ?? null : null,
      warnings: (l.warnings ?? []).map(w => w.replace(LINE_CODE, '')),
    }));
    await this.loadDishes();
  }

  private async loadDishes(): Promise<void> {
    if (this.dishes().length) return;
    try {
      const res = await parseBlob<PagedResponseMenuItemResponse>(await this.api.invoke(listMenuItems, { page: 0, size: 999, active: true }) as unknown);
      this.dishes.set([...(res.content ?? [])].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'es')));
    } catch (e) {
      this.error.set(extractApiError(e, this.t('salesReport.loadError')));
    }
  }

  close(): void {
    if (this.busy) return;
    this.closed.emit();
  }

  /** Un ignorado que sí era un plato: vuelve a la lista para elegir cuál. */
  assign(line: EditLine): void {
    line.dish = '';
  }

  total(): number {
    return this.activeLines.reduce((sum, l) => sum + (l.quantity && l.unitPrice != null ? l.quantity * l.unitPrice : 0), 0);
  }

  totalDiffers(): boolean {
    const printed = this.printedTotal();
    return printed != null && Math.abs(printed - this.total()) >= 0.01;
  }

  lineProblem(l: EditLine): string | null {
    if (l.dish === 'ignore') return null;
    if (!l.dish) return this.t('salesReport.missing.dish');
    if (!l.quantity || l.quantity <= 0 || !Number.isInteger(l.quantity)) return this.t('salesReport.missing.quantity');
    if (l.unitPrice == null || l.unitPrice < 0) return this.t('salesReport.missing.price');
    return null;
  }

  canConfirm(): boolean {
    return this.step() === 'edit' && !!this.header.soldOn && (!this.existingSales() || !!this.header.existingSales)
      && this.activeLines.length > 0 && this.lines.every(l => !this.lineProblem(l));
  }

  async showExisting(saleId: string | undefined): Promise<void> {
    if (!saleId || this.existing()[saleId]) return;
    this.existing.update(x => ({ ...x, [saleId]: 'loading' }));
    try {
      const s = await parseBlob<SaleResponse>(await this.api.invoke(getSale, { id: saleId }) as unknown);
      this.existing.update(x => ({ ...x, [saleId]: s }));
    } catch {
      this.existing.update(x => ({ ...x, [saleId]: 'error' }));
    }
  }

  existingOf(id: string | undefined): SaleResponse | 'loading' | 'error' | undefined {
    return id ? this.existing()[id] : undefined;
  }

  async confirm(): Promise<void> {
    if (!this.canConfirm()) return;
    const body: ConfirmChatSalesReportRequest = {
      reportNumber: this.header.reportNumber.trim() || undefined,
      soldOn: this.header.soldOn,
      existingSales: this.header.existingSales || undefined,
      lines: this.lines.map(l => l.dish === 'ignore'
        ? { printedText: l.printedText || undefined, ignore: true }
        : { printedText: l.printedText || undefined, menuItemId: l.dish, quantity: l.quantity!, unitPrice: l.unitPrice!, ignore: false }),
    };
    this.step.set('saving');
    this.error.set(null);
    let res: ChatResponse;
    try {
      res = await parseBlob<ChatResponse>(await this.api.invoke(confirmChatSalesReport, { body }) as unknown);
    } catch (e) {
      this.error.set(extractApiError(e, this.t('salesReport.saveError')));
      this.step.set('edit');
      return;
    }
    const saleId = res.status === 'REGISTERED' ? res.actions?.[0]?.entityId : undefined;
    if (!saleId) {
      this.error.set(res.message ?? this.t('salesReport.saveError'));
      this.step.set('edit');
      return;
    }
    this.saved.emit(res);
    if (this.files.length) {
      this.step.set('uploading');
      const errors: string[] = [];
      for (const file of this.files) {
        try {
          await this.api.invoke(uploadSaleAttachment, { saleId, body: { file } });
          this.uploaded.update(n => n + 1);
        } catch (e) {
          errors.push(`${file.name}: ${extractApiError(e, this.t('invoice.uploadError'))}`);
        }
      }
      this.uploadErrors.set(errors);
    }
    this.step.set('done');
  }
}
