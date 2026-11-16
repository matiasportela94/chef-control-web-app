import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../api/api';
import { getPurchaseIvaReport } from '../../api/fn/purchase-controller/get-purchase-iva-report';
import { PurchaseIvaReportResponse } from '../../api/models/purchase-iva-report-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { extractApiError } from '../../core/utils/api-error';
import { formatARS, formatDate } from '../../core/utils/format';
import { arDateOf, arDayEnd, arDayStart, arToday } from '../../core/utils/date';
import { formatIvaRate } from '../../core/utils/iva';
import { I18nService } from '../../core/services/i18n.service';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';

interface Period { key: string; from: string; to: string; }

/** Mes argentino: 0 = el actual (hasta hoy), -1 = el anterior completo. */
function monthPeriod(offset: number): { from: string; to: string } {
  const today = arToday();
  const [y, m] = today.split('-').map(Number);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    from: day(new Date(Date.UTC(y, m - 1 + offset, 1))),
    to: offset === 0 ? today : day(new Date(Date.UTC(y, m + offset, 0))),
  };
}

/**
 * IVA de compras del período (el crédito fiscal de un Responsable Inscripto). Los totales los arma el back y solo
 * cuentan las compras con datos de IVA; las cargadas antes salen en la lista con "—" y en un aviso aparte.
 */
@Component({
  selector: 'app-purchase-iva',
  standalone: true,
  imports: [FormsModule, SpinnerComponent],
  templateUrl: './purchase-iva.component.html',
  styleUrl: './purchase-iva.component.scss'
})
export class PurchaseIvaComponent implements OnInit {
  readonly periods: Period[] = [
    { key: 'purchaseIva.thisMonth', ...monthPeriod(0) },
    { key: 'purchaseIva.lastMonth', ...monthPeriod(-1) },
  ];

  from = signal(this.periods[0].from);
  to   = signal(this.periods[0].to);

  report      = signal<PurchaseIvaReportResponse | null>(null);
  loading     = signal(true);
  error       = signal<string | null>(null);
  downloading = signal(false);
  downloadError = signal<string | null>(null);

  readonly validRange = computed(() => !!this.from() && !!this.to() && this.from() <= this.to());
  readonly withoutIva = computed(() => {
    const w = this.report()?.withoutIvaData;
    return w?.purchaseCount ? w : null;
  });

  /** Para descartar la respuesta de un período que ya no es el elegido. */
  private requestSeq = 0;

  constructor(private api: Api, private i18n: I18nService) {}

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  ngOnInit(): void {
    void this.load();
  }

  isPeriod(p: Period): boolean {
    return this.from() === p.from && this.to() === p.to;
  }

  applyPeriod(p: Period): void {
    this.from.set(p.from);
    this.to.set(p.to);
    void this.load();
  }

  onDateChange(): void {
    if (this.validRange()) void this.load();
  }

  async load(): Promise<void> {
    if (!this.validRange()) return;
    const seq = ++this.requestSeq;
    this.loading.set(true);
    this.error.set(null);
    try {
      // Días argentinos, inclusivos en las dos puntas (el back toma instantes).
      const raw = await this.api.invoke(getPurchaseIvaReport, { from: arDayStart(this.from()), to: arDayEnd(this.to()) }) as unknown;
      const res = await parseBlob<PurchaseIvaReportResponse>(raw);
      if (seq === this.requestSeq) this.report.set(res);
    } catch (e) {
      if (seq === this.requestSeq) {
        this.report.set(null);
        this.error.set(extractApiError(e, this.t('purchaseIva.loadError')));
      }
    } finally {
      if (seq === this.requestSeq) this.loading.set(false);
    }
  }

  async downloadExcel(): Promise<void> {
    const r = this.report();
    if (!r) return;
    this.downloading.set(true);
    this.downloadError.set(null);
    try {
      const { default: writeXlsxFile } = await import('write-excel-file/browser');
      // Números y fechas como tales, con formato: un Excel en es-AR los muestra con coma decimal y se pueden sumar.
      const money = (v?: number | null) => v == null ? null : { value: v, type: Number, format: '#,##0.00' };
      const bold = (value: string) => ({ value, fontWeight: 'bold' as const });
      const purchaseRows = (r.purchases ?? []).map(p => [
        // El día argentino, como se ve en la app (el Excel no tiene zona horaria).
        p.purchasedAt ? { value: new Date(arDateOf(p.purchasedAt) + 'T00:00:00Z'), type: Date, format: 'dd/mm/yyyy' } : null,
        p.supplierName ?? '',
        p.pricesIncludeIva == null ? this.t('purchaseIva.noIvaData') : this.t(p.pricesIncludeIva ? 'purchaseIva.yes' : 'purchaseIva.no'),
        money(p.netTotal), money(p.ivaTotal), money(p.total),
      ]);
      const without = this.withoutIva();
      await writeXlsxFile([
        {
          sheet: this.t('purchaseIva.excel.sheetPurchases'),
          stickyRowsCount: 1,
          columns: [{ width: 12 }, { width: 30 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }],
          data: [
            [bold(this.t('purchaseIva.colDate')), bold(this.t('purchaseIva.colSupplier')), bold(this.t('purchaseIva.excel.colPricesIncludeIva')),
             bold(this.t('purchaseIva.net')), bold(this.t('purchaseIva.iva')), bold(this.t('purchaseIva.total'))],
            ...purchaseRows,
            [null],
            [bold(this.t('purchaseIva.excel.totalWithIva')), null, null, money(r.netTotal), money(r.ivaTotal), money(r.total)],
            ...(without ? [[this.t('purchaseIva.excel.withoutIva', { count: without.purchaseCount ?? 0 }), null, null, null, null, money(without.total)]] : []),
          ],
        },
        {
          sheet: this.t('purchaseIva.excel.sheetByRate'),
          stickyRowsCount: 1,
          columns: [{ width: 12 }, { width: 16 }, { width: 16 }],
          data: [
            [bold(this.t('purchaseIva.rate')), bold(this.t('purchaseIva.net')), bold(this.t('purchaseIva.iva'))],
            ...(r.byRate ?? []).map(b => [this.rateLabel(b.ivaPercentage), money(b.netAmount), money(b.ivaAmount)]),
          ],
        },
      ]).toFile(this.t('purchaseIva.excel.fileName', { from: this.from(), to: this.to() }));
    } catch (e) {
      this.downloadError.set(extractApiError(e, this.t('purchaseIva.downloadError')));
    } finally {
      this.downloading.set(false);
    }
  }

  rateLabel(rate?: number | null): string {
    if (rate == null) return '—';
    return rate === 0 ? this.t('purchaseIva.rateNone') : formatIvaRate(rate);
  }

  readonly formatARS = formatARS;
  readonly formatDate = formatDate;
}
