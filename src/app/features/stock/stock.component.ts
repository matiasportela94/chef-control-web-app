import { Component, OnInit, signal } from '@angular/core';
import { HttpClient, HttpContext, HttpResponse } from '@angular/common/http';
import { filter, map } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { Api } from '../../api/api';
import { RequestBuilder } from '../../api/request-builder';
import { StrictHttpResponse } from '../../api/strict-http-response';
import { getStock } from '../../api/fn/product-controller/get-stock';
import { listProducts } from '../../api/fn/product-controller/list-products';
import { ProductResponse } from '../../api/models/product-response';
import { StockMovementResponse } from '../../api/models/stock-movement-response';
import { PagedResponseProductResponse } from '../../api/models/paged-response-product-response';
import { PagedResponseStockMovementResponse } from '../../api/models/paged-response-stock-movement-response';
import { listUnits } from '../../api/fn/unit-controller/list-units';
import { UnitResponse } from '../../api/models/unit-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatDatetime, formatNum } from '../../core/utils/format';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';

interface StockInfo { productId: string; currentStock: number; }

// Temporary until spec is regenerated with productId filter
function listMovementsByProduct(
  http: HttpClient, rootUrl: string,
  params: { productId: string; page?: number; size?: number },
  context?: HttpContext
) {
  const rb = new RequestBuilder(rootUrl, '/stock-movements', 'get');
  rb.query('productId', params.productId, {});
  rb.query('page', params.page ?? 0, {});
  rb.query('size', params.size ?? 50, {});
  return http.request(rb.build({ responseType: 'blob', accept: '*/*', context })).pipe(
    filter((r: any): r is HttpResponse<any> => r instanceof HttpResponse),
    map((r: HttpResponse<any>) => r as StrictHttpResponse<PagedResponseStockMovementResponse>)
  );
}

@Component({
  selector: 'app-stock',
  standalone: true,
  imports: [FormsModule, PaginatorComponent, SpinnerComponent],
  templateUrl: './stock.component.html',
  styleUrl: './stock.component.scss'
})
export class StockComponent implements OnInit {
  products  = signal<ProductResponse[]>([]);
  units     = signal<UnitResponse[]>([]);

  selectedProductId = signal<string>('');

  stockInfo      = signal<StockInfo | null>(null);
  stockLoading   = signal(false);

  movements      = signal<StockMovementResponse[]>([]);
  movementsLoading = signal(false);
  movementsError   = signal<string | null>(null);
  page     = signal(1);
  pageSize = 50;
  total    = signal(0);

  constructor(private api: Api) {}

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadProducts(), this.loadUnits()]);
  }

  async loadProducts(): Promise<void> {
    try {
      const raw = await this.api.invoke(listProducts, { page: 0, size: 999 }) as unknown;
      const res = await parseBlob<PagedResponseProductResponse>(raw);
      this.products.set(res.content ?? []);
    } catch { /* non-critical */ }
  }

  async loadUnits(): Promise<void> {
    try {
      const raw = await this.api.invoke(listUnits) as unknown;
      this.units.set(await parseBlob<UnitResponse[]>(raw));
    } catch { /* non-critical */ }
  }

  get selectedProduct(): ProductResponse | undefined {
    return this.products().find(p => p.id === this.selectedProductId());
  }

  async onProductChange(): Promise<void> {
    const id = this.selectedProductId();
    if (!id) {
      this.stockInfo.set(null);
      this.movements.set([]);
      this.total.set(0);
      return;
    }
    this.page.set(1);
    await Promise.all([this.loadStock(id), this.loadMovements(id)]);
  }

  async loadStock(productId: string): Promise<void> {
    this.stockLoading.set(true);
    try {
      const raw = await this.api.invoke(getStock, { id: productId }) as unknown;
      const info = await parseBlob<StockInfo>(raw);
      this.stockInfo.set(info);
    } catch {
      this.stockInfo.set(null);
    } finally {
      this.stockLoading.set(false);
    }
  }

  async loadMovements(productId: string): Promise<void> {
    this.movementsLoading.set(true);
    this.movementsError.set(null);
    try {
      const raw = await this.api.invoke$Response(
        listMovementsByProduct,
        { productId, page: this.page() - 1, size: this.pageSize }
      );
      const res = await parseBlob<PagedResponseStockMovementResponse>(raw.body as unknown);
      this.movements.set(res.content ?? []);
      this.total.set(res.totalElements ?? 0);
    } catch {
      this.movementsError.set('No se pudieron cargar los movimientos.');
    } finally {
      this.movementsLoading.set(false);
    }
  }

  async goToPage(p: number): Promise<void> {
    this.page.set(p);
    await this.loadMovements(this.selectedProductId());
  }

  stockStatus(): 'ok' | 'low' | 'over' | 'none' {
    const p = this.selectedProduct;
    const s = this.stockInfo()?.currentStock;
    if (s == null) return 'none';
    if (p?.minStock != null && s < p.minStock) return 'low';
    if (p?.maxStock != null && s > p.maxStock) return 'over';
    if (p?.minStock == null && p?.maxStock == null) return 'none';
    return 'ok';
  }

  unitAbbr(unitId?: string): string {
    if (!unitId) return '';
    return this.units().find(u => u.id === unitId)?.abbreviation ?? '';
  }

  typeLabel(type?: string): string {
    const map: Record<string, string> = {
      PURCHASE:    'Compra',
      SALE:        'Venta',
      WASTE:       'Merma',
      STOCK_COUNT: 'Conteo',
      ADJUSTMENT:  'Ajuste',
      REVERSAL:    'Reversión',
    };
    return type ? (map[type] ?? type) : '—';
  }

  readonly formatDate = formatDatetime;
  readonly formatNum = formatNum;
}
