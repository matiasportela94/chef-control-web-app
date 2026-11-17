import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { Api } from '../../api/api';
import { getPurchaseIvaReport } from '../../api/fn/purchase-controller/get-purchase-iva-report';
import { getSalesIvaReport } from '../../api/fn/sale-controller/get-sales-iva-report';
import { PurchaseIvaReportResponse } from '../../api/models/purchase-iva-report-response';
import { SalesIvaReportResponse } from '../../api/models/sales-iva-report-response';
import { IvaRateTotal } from '../../api/models/iva-rate-total';
import { parseBlob } from '../../core/utils/parse-blob';
import { extractApiError } from '../../core/utils/api-error';
import { formatARS, formatDate } from '../../core/utils/format';
import { arDateOf, arDayEnd, arDayStart, arToday } from '../../core/utils/date';
import { formatIvaRate } from '../../core/utils/iva';
import { AuthService } from '../../core/services/auth.service';
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
 * IVA del período: compras (crédito fiscal), ventas (débito fiscal) y el saldo estimado. Ventas y saldo solo en un
 * local Responsable Inscripto (un monotributista no liquida IVA) y con SALES_VIEW; la ruta exige PURCHASES_VIEW.
 * Los totales los arma el back y solo cuentan lo que tiene datos de IVA; lo cargado antes sale en un aviso aparte.
 */
@Component({
  selector: 'app-iva',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, SpinnerComponent],
  templateUrl: './iva.component.html',
  styleUrl: './iva.component.scss'
})
export class IvaComponent implements OnInit {
  readonly periods: Period[] = [
    { key: 'iva.thisMonth', ...monthPeriod(0) },
    { key: 'iva.lastMonth', ...monthPeriod(-1) },
  ];

  from = signal(this.periods[0].from);
  to   = signal(this.periods[0].to);

  purchases   = signal<PurchaseIvaReportResponse | null>(null);
  sales       = signal<SalesIvaReportResponse | null>(null);
  loading     = signal(true);
  error       = signal<string | null>(null);
  downloading = signal(false);
  downloadError = signal<string | null>(null);

  readonly isRi = computed(() => this.auth.isResponsableInscripto());
  /** Ventas y saldo: RI y permiso de ver ventas (el de compras ya lo pide la ruta). */
  readonly showSales = computed(() => this.isRi() && this.auth.hasPermission('SALES_VIEW'));

  readonly validRange = computed(() => !!this.from() && !!this.to() && this.from() <= this.to());
  readonly purchasesWithoutIva = computed(() => {
    const w = this.purchases()?.withoutIvaData;
    return w?.purchaseCount ? w : null;
  });
  readonly salesWithoutIva = computed(() => {
    const w = this.sales()?.withoutIvaData;
    return w?.saleCount ? w : null;
  });
  /** IVA ventas − IVA compras, en centavos para no arrastrar decimales. > 0 a pagar, < 0 a favor. */
  readonly balance = computed(() => {
    const s = this.sales(), p = this.purchases();
    if (!this.showSales() || !s || !p) return null;
    return (Math.round((s.ivaTotal ?? 0) * 100) - Math.round((p.ivaTotal ?? 0) * 100)) / 100;
  });

  /** Para descartar la respuesta de un período que ya no es el elegido. */
  private requestSeq = 0;

  constructor(private api: Api, private auth: AuthService, private i18n: I18nService) {}

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
    // Días argentinos, inclusivos en las dos puntas (el back toma instantes).
    const range = { from: arDayStart(this.from()), to: arDayEnd(this.to()) };
    try {
      const [purchases, sales] = await Promise.all([
        this.api.invoke(getPurchaseIvaReport, range).then(raw => parseBlob<PurchaseIvaReportResponse>(raw as unknown)),
        this.showSales()
          ? this.api.invoke(getSalesIvaReport, range).then(raw => parseBlob<SalesIvaReportResponse>(raw as unknown))
          : Promise.resolve(null),
      ]);
      if (seq !== this.requestSeq) return;
      this.purchases.set(purchases);
      this.sales.set(sales);
    } catch (e) {
      if (seq !== this.requestSeq) return;
      this.purchases.set(null);
      this.sales.set(null);
      this.error.set(extractApiError(e, this.t('iva.loadError')));
    } finally {
      if (seq === this.requestSeq) this.loading.set(false);
    }
  }

  balanceLabel(b: number): string {
    return this.t(b > 0 ? 'iva.balanceToPay' : b < 0 ? 'iva.balanceInFavor' : 'iva.balanceZero');
  }

  async downloadExcel(): Promise<void> {
    const p = this.purchases();
    if (!p) return;
    const s = this.showSales() ? this.sales() : null;
    this.downloading.set(true);
    this.downloadError.set(null);
    try {
      const { default: writeXlsxFile } = await import('write-excel-file/browser');
      // Números y fechas como tales, con formato: un Excel en es-AR los muestra con coma decimal y se pueden sumar.
      const money = (v?: number | null) => v == null ? null : { value: v, type: Number, format: '#,##0.00' };
      // El día argentino, como se ve en la app (el Excel no tiene zona horaria).
      const day = (instant?: string) => instant ? { value: new Date(arDateOf(instant) + 'T00:00:00Z'), type: Date, format: 'dd/mm/yyyy' } : null;
      const bold = (value: string) => ({ value, fontWeight: 'bold' as const });
      const t = (k: string, params?: Record<string, string | number>) => this.t(k, params);
      const byRateSheet = (sheet: string, rows: IvaRateTotal[] = []) => ({
        sheet, stickyRowsCount: 1, columns: [{ width: 12 }, { width: 16 }, { width: 16 }],
        data: [[bold(t('iva.rate')), bold(t('iva.net')), bold(t('iva.iva'))],
               ...rows.map(b => [this.rateLabel(b.ivaPercentage), money(b.netAmount), money(b.ivaAmount)])],
      });
      const pw = this.purchasesWithoutIva();
      const sheets: any[] = [
        {
          sheet: t('iva.excel.sheetPurchases'), stickyRowsCount: 1,
          columns: [{ width: 12 }, { width: 30 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }],
          data: [
            [bold(t('iva.colDate')), bold(t('iva.colSupplier')), bold(t('iva.excel.colPricesIncludeIva')),
             bold(t('iva.net')), bold(t('iva.iva')), bold(t('iva.total'))],
            ...(p.purchases ?? []).map(r => [
              day(r.purchasedAt), r.supplierName ?? '',
              r.pricesIncludeIva == null ? t('iva.noIvaData') : t(r.pricesIncludeIva ? 'iva.yes' : 'iva.no'),
              money(r.netTotal), money(r.ivaTotal), money(r.total),
            ]),
            [null],
            [bold(t('iva.excel.totalWithIva')), null, null, money(p.netTotal), money(p.ivaTotal), money(p.total)],
            ...(pw ? [[t('iva.excel.withoutIva', { count: pw.purchaseCount ?? 0 }), null, null, null, null, money(pw.total)]] : []),
          ],
        },
        byRateSheet(t('iva.excel.sheetPurchasesByRate'), p.byRate),
      ];
      if (s) {
        const sw = this.salesWithoutIva();
        const balance = this.balance() ?? 0;
        sheets.unshift({
          sheet: t('iva.excel.sheetSummary'), columns: [{ width: 34 }, { width: 18 }],
          data: [
            [bold(t('iva.excel.period')), `${this.from()} — ${this.to()}`],
            [t('iva.excel.salesIva'), money(s.ivaTotal)],
            [t('iva.excel.purchasesIva'), money(p.ivaTotal)],
            [bold(this.balanceLabel(balance)), money(Math.abs(balance))],
            [null],
            [t('iva.disclaimer')],
          ],
        });
        sheets.push(
          {
            sheet: t('iva.excel.sheetSales'), stickyRowsCount: 1,
            columns: [{ width: 12 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }],
            data: [
              [bold(t('iva.colDate')), bold(t('iva.rate')), bold(t('iva.net')), bold(t('iva.iva')), bold(t('iva.total'))],
              ...(s.sales ?? []).map(r => [
                day(r.soldAt), r.ivaPercentage == null ? t('iva.noIvaData') : this.rateLabel(r.ivaPercentage),
                money(r.netTotal), money(r.ivaTotal), money(r.total),
              ]),
              [null],
              [bold(t('iva.excel.totalWithIva')), null, money(s.netTotal), money(s.ivaTotal), money(s.total)],
              ...(sw ? [[t('iva.excel.withoutIva', { count: sw.saleCount ?? 0 }), null, null, null, money(sw.total)]] : []),
            ],
          },
          byRateSheet(t('iva.excel.sheetSalesByRate'), s.byRate),
        );
      }
      await writeXlsxFile(sheets).toFile(t('iva.excel.fileName', { from: this.from(), to: this.to() }));
    } catch (e) {
      this.downloadError.set(extractApiError(e, this.t('iva.downloadError')));
    } finally {
      this.downloading.set(false);
    }
  }

  rateLabel(rate?: number | null): string {
    if (rate == null) return '—';
    return rate === 0 ? this.t('iva.rateNone') : formatIvaRate(rate);
  }

  readonly formatARS = formatARS;
  readonly formatDate = formatDate;
  readonly abs = Math.abs;
}
