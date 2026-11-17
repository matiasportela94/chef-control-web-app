import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../../api/api';
import { UnitResponse } from '../../../api/models/unit-response';
import {
  PreparationCostResponse, PreparationRecipeResponse, ProductWithPreparation,
  deletePreparationRecipe, getPreparationCost, getPreparationRecipe, setPreparationRecipe,
} from '../../../core/api-pending/preparations';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { extractApiError } from '../../../core/utils/api-error';
import { formatARS, formatNum } from '../../../core/utils/format';
import { parseBlob } from '../../../core/utils/parse-blob';
import { ActionDialogComponent } from '../../../shared/components/action-dialog/action-dialog.component';
import { SelectComponent, SelectOption } from '../../../shared/components/select/select.component';

/**
 * "Receta de preparación" del drawer de un insumo: con qué se hace una tanda y cuánto rinde (en la unidad del insumo).
 * Guardarla convierte al insumo en preparación; quitarla lo vuelve común, con su stock. El costo lo calcula el back.
 */
@Component({
  selector: 'app-preparation-recipe',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, SelectComponent, ActionDialogComponent],
  templateUrl: './preparation-recipe.component.html',
  styleUrl: './preparation-recipe.component.scss'
})
export class PreparationRecipeComponent implements OnChanges {
  @Input({ required: true }) product!: ProductWithPreparation;
  @Input() products: ProductWithPreparation[] = [];
  @Input() units: UnitResponse[] = [];
  /** Recién creado con "Crear y cargar receta": el editor arranca abierto. */
  @Input() startOpen = false;
  /** Se guardó o se quitó: la lista de insumos cambia (el badge "Preparación"). */
  @Output() changed = new EventEmitter<void>();

  editing = signal(false);
  /** Si ya es preparación (tiene receta guardada). El `product` del padre no se refresca al guardar. */
  isPreparation = signal(false);
  loading = signal(false);
  saving  = signal(false);
  error   = signal<string | null>(null);
  saved   = signal(false);
  cost    = signal<PreparationCostResponse | null>(null);
  removeOpen = signal(false);

  form: FormGroup;
  /** Cualquier insumo activo menos ella misma (los ciclos más largos los frena el back con PREPARATION_CYCLE). */
  productOptions: SelectOption[] = [];
  unitOptions: SelectOption[] = [];

  constructor(private api: Api, private fb: FormBuilder, private auth: AuthService, private i18n: I18nService) {
    this.form = this.fb.group({
      yieldQuantity: [null as number | null, [Validators.required, Validators.min(0.001)]],
      items: this.fb.array([]),
    });
  }

  get locked(): boolean { return !this.auth.hasFeature('RECIPES_AND_FOOD_COST'); }
  get canEdit(): boolean { return this.auth.hasPermission('PRODUCTS_UPDATE'); }
  get canSeePlans(): boolean { return this.auth.hasPermission('ACCOUNT_VIEW'); }
  get items(): FormArray { return this.form.get('items') as FormArray; }

  get yieldUnit(): string {
    return this.product.defaultUnit?.abbreviation ?? '';
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.productOptions = this.products.filter(p => p.isActive && p.id !== this.product.id)
      .map(p => ({ value: p.id ?? '', label: p.preparation ? `${p.name} · ${this.t('common.preparation')}` : (p.name ?? '') }));
    this.unitOptions = this.units.map(u => ({ value: u.id ?? '', label: u.abbreviation ?? u.name ?? '' }));
    // Recargar la lista de insumos (después de guardar) no tiene que pisar lo que se está editando.
    if (!changes['product']) return;
    this.error.set(null);
    this.saved.set(false);
    this.cost.set(null);
    this.resetForm(null);
    this.isPreparation.set(!!this.product.preparation);
    this.editing.set(!!this.product.preparation || this.startOpen);
    if (this.product.preparation && !this.locked) void this.load();
  }

  private resetForm(recipe: PreparationRecipeResponse | null): void {
    this.items.clear();
    for (const i of recipe?.items ?? []) this.items.push(this.itemGroup(i.productId, i.quantity, i.unitId));
    if (!this.items.length) this.items.push(this.itemGroup());
    this.form.get('yieldQuantity')!.setValue(recipe?.yieldQuantity ?? null);
  }

  private itemGroup(productId = '', quantity: number | null = null, unitId = ''): FormGroup {
    return this.fb.group({
      productId: [productId, Validators.required],
      quantity:  [quantity, [Validators.required, Validators.min(0.001)]],
      unitId:    [unitId, Validators.required],
    });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const recipe = await parseBlob<PreparationRecipeResponse>(await this.api.invoke(getPreparationRecipe, { id: this.product.id! }) as unknown);
      this.resetForm(recipe);
      await this.loadCost();
    } catch (e) {
      this.error.set(extractApiError(e, this.t('products.prep.loadError')));
    } finally {
      this.loading.set(false);
    }
  }

  /** Sin compras de algún ingrediente el back no puede costear: el costo queda en blanco, no es un error. */
  private async loadCost(): Promise<void> {
    try {
      this.cost.set(await parseBlob<PreparationCostResponse>(await this.api.invoke(getPreparationCost, { id: this.product.id! }) as unknown));
    } catch {
      this.cost.set(null);
    }
  }

  start(): void {
    this.editing.set(true);
  }

  addItem(): void {
    this.items.push(this.itemGroup());
  }

  removeItem(index: number): void {
    this.items.removeAt(index);
  }

  /** Al elegir el insumo se propone su unidad. */
  onItemProductChange(index: number): void {
    const group = this.items.at(index);
    const p = this.products.find(x => x.id === group.get('productId')?.value);
    if (p?.defaultUnit?.id) group.get('unitId')?.setValue(p.defaultUnit.id);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); this.error.set(this.t('products.prep.invalid')); return; }
    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);
    const v = this.form.getRawValue();
    try {
      const recipe = await parseBlob<PreparationRecipeResponse>(await this.api.invoke(setPreparationRecipe, { id: this.product.id!, body: {
        yieldQuantity: +v.yieldQuantity,
        items: v.items.map((i: any) => ({ productId: i.productId, quantity: +i.quantity, unitId: i.unitId })),
      } }) as unknown);
      if (recipe?.items) this.resetForm(recipe);
      this.saved.set(true);
      this.isPreparation.set(true);
      await this.loadCost();
      this.changed.emit();
    } catch (e: any) {
      this.error.set(this.apiError(e, 'products.prep.saveError'));
    } finally {
      this.saving.set(false);
    }
  }

  async confirmRemove(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.invoke(deletePreparationRecipe, { id: this.product.id! });
      this.removeOpen.set(false);
      this.cost.set(null);
      this.resetForm(null);
      this.editing.set(false);
      this.isPreparation.set(false);
      this.changed.emit();
    } catch (e) {
      this.removeOpen.set(false);
      this.error.set(extractApiError(e, this.t('products.prep.removeError')));
    } finally {
      this.saving.set(false);
    }
  }

  /** El ciclo trae el camino en el mensaje ("Mil islas → Mayonesa base → Mil islas"): sin él no se sabe qué arreglar. */
  private apiError(e: any, fallback: string): string {
    const text = extractApiError(e, this.t(fallback));
    const message: string | undefined = e?.error?.message;
    if (e?.error?.errorCode === 'PREPARATION_CYCLE' && message?.includes('→')) {
      return `${text}: ${message.slice(message.search(/[^:]*→/)).trim()}`;
    }
    return text;
  }

  isItemInvalid(index: number, field: string): boolean {
    const c = this.items.at(index).get(field);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  isYieldInvalid(): boolean {
    const c = this.form.get('yieldQuantity')!;
    return c.invalid && (c.touched || c.dirty);
  }

  readonly formatARS = formatARS;
  readonly formatNum = formatNum;
}
