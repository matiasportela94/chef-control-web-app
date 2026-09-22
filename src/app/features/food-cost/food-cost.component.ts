import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../api/api';
import { calculate } from '../../api/fn/food-cost-controller/calculate';
import { listMenuItems } from '../../api/fn/menu-item-controller/list-menu-items';
import { getRecipeCost } from '../../api/fn/menu-item-controller/get-recipe-cost';
import { getFoodCost } from '../../api/fn/menu-item-controller/get-food-cost';
import { getPriceEvolution } from '../../api/fn/menu-item-controller/get-price-evolution';
import { FoodCostResponse } from '../../api/models/food-cost-response';
import { MenuItemFoodCostResponse } from '../../api/models/menu-item-food-cost-response';
import { MenuItemResponse } from '../../api/models/menu-item-response';
import { PagedResponseMenuItemResponse } from '../../api/models/paged-response-menu-item-response';
import { RecipeCostResponse } from '../../api/models/recipe-cost-response';
import { PriceEvolutionResponse } from '../../api/models/price-evolution-response';
import { IngredientCost } from '../../api/models/ingredient-cost';
import { parseBlob } from '../../core/utils/parse-blob';
import { extractApiError } from '../../core/utils/api-error';
import { formatARS, formatDate, formatNum, formatPct } from '../../core/utils/format';
import { todayISO, firstOfMonth, thisMonth, lastMonth, lastNDays } from '../../core/utils/date';
import { SelectComponent, SelectOption } from '../../shared/components/select/select.component';
import { ChartSeries, StepLineChartComponent } from '../../shared/components/step-line-chart/step-line-chart.component';
import { I18nService } from '../../core/services/i18n.service';

interface Preset { label: string; from: string; to: string; }

@Component({
  selector: 'app-food-cost',
  standalone: true,
  imports: [FormsModule, SelectComponent, StepLineChartComponent],
  templateUrl: './food-cost.component.html',
  styleUrl: './food-cost.component.scss'
})
export class FoodCostComponent implements OnInit {
  mode = signal<'global' | 'dish' | 'history'>('global');

  // ── Aviso del rendimiento ────────────────────────────────────────────────
  // Al cargar rendimientos el food cost teórico de todos los platos sube de golpe. Sin
  // explicación el dueño piensa que se rompió el cálculo, así que se avisa una vez.
  // Es una conveniencia por navegador: si se borra el storage vuelve a aparecer, y está bien.
  private static readonly YIELD_NOTICE_KEY = 'chefcontrol.foodCost.yieldNoticeDismissed';
  showYieldNotice = signal(this.readYieldNoticeFlag());

  private readYieldNoticeFlag(): boolean {
    try {
      return localStorage.getItem(FoodCostComponent.YIELD_NOTICE_KEY) !== '1';
    } catch {
      return true; // modo privado o storage bloqueado: mostrarlo es el default seguro
    }
  }

  dismissYieldNotice(): void {
    this.showYieldNotice.set(false);
    try { localStorage.setItem(FoodCostComponent.YIELD_NOTICE_KEY, '1'); } catch { /* no pasa nada */ }
  }

  /** Solo se muestran las dos cantidades cuando el rendimiento cambia algo. */
  hasYield(ing: IngredientCost): boolean {
    return ing.yieldPercentage != null && ing.yieldPercentage !== 100 && ing.grossQuantity != null;
  }

  t = (key: string, params?: Record<string, string | number>) => this.i18n.t(key, params);

  from = signal(firstOfMonth());
  to   = signal(todayISO());

  // Global
  loading = signal(false);
  error   = signal<string | null>(null);
  result  = signal<FoodCostResponse | null>(null);

  // Per-dish
  menuItems          = signal<MenuItemResponse[]>([]);
  selectedMenuItemId = signal<string>('');

  recipeCostLoading = signal(false);
  recipeCostError   = signal<string | null>(null);
  recipeCost        = signal<RecipeCostResponse | null>(null);

  fcItemLoading = signal(false);
  fcItemError   = signal<string | null>(null);
  fcItem        = signal<MenuItemFoodCostResponse | null>(null);
  fcItemStale   = signal(false);

  // ── Histórico ─────────────────────────────────────────────────────────────
  evolution        = signal<PriceEvolutionResponse | null>(null);
  evolutionLoading = signal(false);
  evolutionError   = signal<string | null>(null);
  /** La guía de dataviz pide que todo gráfico tenga su gemelo en tabla. */
  showTable        = signal(false);

  priceSeries = computed<ChartSeries[]>(() => [{
    label: this.t('foodCost.priceChart'),
    color: 'var(--chart-1)',
    points: (this.evolution()?.points ?? []).map(p => ({ at: p.at!, value: p.menuPrice })),
  }]);

  foodCostSeries = computed<ChartSeries[]>(() => [{
    label: this.t('foodCost.foodCostChart'),
    color: 'var(--chart-2)',
    points: (this.evolution()?.points ?? []).map(p => ({ at: p.at!, value: p.foodCostPercentage })),
  }]);

  /** Solo se avisa si el período pedido cae, aunque sea en parte, antes de que haya historial. */
  showsUnreliableRange = computed(() => {
    const reliableFrom = this.evolution()?.seriesReliableFrom;
    return !!reliableFrom && Date.parse(this.from()) < Date.parse(reliableFrom);
  });

  reliableFromLabel = computed(() => {
    const reliableFrom = this.evolution()?.seriesReliableFrom;
    return reliableFrom ? formatDate(reliableFrom) : '';
  });

  async loadEvolution(): Promise<void> {
    const id = this.selectedMenuItemId();
    if (!id) { this.evolution.set(null); return; }
    this.evolutionLoading.set(true);
    this.evolutionError.set(null);
    try {
      const raw = await this.api.invoke(getPriceEvolution, {
        id,
        from: `${this.from()}T00:00:00Z`,
        to:   `${this.to()}T23:59:59Z`,
      }) as unknown;
      this.evolution.set(await parseBlob<PriceEvolutionResponse>(raw));
    } catch (e: any) {
      this.evolution.set(null);
      this.evolutionError.set(extractApiError(e, 'No se pudo cargar el histórico del plato.'));
    } finally {
      this.evolutionLoading.set(false);
    }
  }

  readonly presets: Preset[] = [
    { label: 'Este mes',       ...thisMonth()   },
    { label: 'Mes anterior',   ...lastMonth()   },
    { label: 'Últimos 7 días', ...lastNDays(7)  },
    { label: 'Últimos 30 días',...lastNDays(30) },
  ];

  readonly Math = Math;

  constructor(private api: Api, private i18n: I18nService) {}

  menuItemOptions(): SelectOption[] {
    return this.menuItems().map(m => ({ value: m.id!, label: m.name! }));
  }

  async ngOnInit(): Promise<void> {
    await this.loadMenuItems();
  }

  async loadMenuItems(): Promise<void> {
    try {
      const raw = await this.api.invoke(listMenuItems, { page: 0, size: 999 }) as unknown;
      const res = await parseBlob<PagedResponseMenuItemResponse>(raw);
      this.menuItems.set(res.content ?? []);
    } catch { /* non-critical */ }
  }

  async onDishSelect(): Promise<void> {
    const id = this.selectedMenuItemId();
    if (!id) {
      this.recipeCost.set(null);
      this.fcItem.set(null);
      this.recipeCostError.set(null);
      this.fcItemError.set(null);
      this.fcItemStale.set(false);
      return;
    }
    await Promise.all([this.loadRecipeCost(id), this.loadFcItem(id), this.loadEvolution()]);
  }

  async loadRecipeCost(id: string): Promise<void> {
    this.recipeCostLoading.set(true);
    this.recipeCostError.set(null);
    this.recipeCost.set(null);
    try {
      const raw = await this.api.invoke(getRecipeCost, { id }) as unknown;
      this.recipeCost.set(await parseBlob<RecipeCostResponse>(raw));
    } catch {
      this.recipeCostError.set('Sin receta cargada o error al obtener los datos.');
    } finally {
      this.recipeCostLoading.set(false);
    }
  }

  async loadFcItem(id: string): Promise<void> {
    this.fcItemLoading.set(true);
    this.fcItemError.set(null);
    this.fcItemStale.set(false);
    try {
      const raw = await this.api.invoke(getFoodCost, {
        id,
        from: this.from() + 'T00:00:00Z',
        to:   this.to()   + 'T23:59:59Z',
      }) as unknown;
      this.fcItem.set(await parseBlob<MenuItemFoodCostResponse>(raw));
    } catch {
      this.fcItemError.set('No se pudo obtener el food cost para este plato.');
    } finally {
      this.fcItemLoading.set(false);
    }
  }

  async calculateRealized(): Promise<void> {
    const id = this.selectedMenuItemId();
    if (id) await this.loadFcItem(id);
  }

  applyPreset(p: Preset): void {
    this.from.set(p.from);
    this.to.set(p.to);
    this.result.set(null);
    if (this.selectedMenuItemId() && this.fcItem()) this.fcItemStale.set(true);
  }

  onDateChange(): void {
    this.result.set(null);
    if (this.selectedMenuItemId() && this.fcItem()) this.fcItemStale.set(true);
  }

  async calculate(): Promise<void> {
    if (!this.from() || !this.to()) return;
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);
    try {
      const raw = await this.api.invoke(calculate, {
        from: this.from() + 'T00:00:00Z',
        to:   this.to()   + 'T23:59:59Z',
      }) as unknown;
      this.result.set(await parseBlob<FoodCostResponse>(raw));
    } catch {
      this.error.set('No se pudo calcular el food cost. Verificá el rango de fechas.');
    } finally {
      this.loading.set(false);
    }
  }

  pctStatus(pct?: number): 'great' | 'ok' | 'high' | 'danger' {
    if (pct == null) return 'ok';
    if (pct < 28) return 'great';
    if (pct < 35) return 'ok';
    if (pct < 40) return 'high';
    return 'danger';
  }

  foodCostStatus()   { return this.pctStatus(this.result()?.foodCostPercentage); }
  recipeCostStatus() { return this.pctStatus(this.recipeCost()?.foodCostPercentage); }
  fcItemStatus()     { return this.pctStatus(this.fcItem()?.foodCostPercentage); }

  readonly formatARS = formatARS;
  readonly formatDate = formatDate;
  readonly formatNum = formatNum;
  readonly formatPct = formatPct;
}
