import { Component, EventEmitter, Input, Output, WritableSignal, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../../api/api';
import { listUnits } from '../../../api/fn/unit-controller/list-units';
import { importCatalog } from '../../../api/fn/catalog-import-controller/import-catalog';
import { interpretCatalogSpreadsheet } from '../../../api/fn/ai-controller/interpret-catalog-spreadsheet';
import { InterpretCatalogResult } from '../../../api/models/interpret-catalog-result';
import { CatalogImportResult } from '../../../api/models/catalog-import-result';
import { RecipeReplacement } from '../../../api/models/recipe-replacement';
import { PreparationImportRow } from '../../../api/models/preparation-import-row';
import { PreparationReplacement } from '../../../api/models/preparation-replacement';
import { ImportRowError } from '../../../api/models/import-row-error';
import { ProductImportRow } from '../../../api/models/product-import-row';
import { RecipeImportRow } from '../../../api/models/recipe-import-row';
import { UnitResponse } from '../../../api/models/unit-response';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { extractApiError } from '../../../core/utils/api-error';
import { getErrorMessage } from '../../../core/utils/error-messages';
import { parseBlob } from '../../../core/utils/parse-blob';
import { formatNum } from '../../../core/utils/format';
import { DrawerComponent } from '../drawer/drawer.component';
import {
  ImportLabels, ImportSheet, MAX_INTERPRET_ROWS, MAX_INTERPRET_SHEETS, PREPARATION_FIELDS, PRODUCT_FIELDS, RECIPE_FIELDS, REQUIRED_FIELDS,
  RowRef, UNREADABLE_NUMBER,
  buildInterpretSheets, parseCatalogWorkbook
} from './catalog-import-parse';

/** Más que esto no se dibuja: con 500 errores la lista no se lee igual, y el primero ya dice qué corregir. */
const MAX_ERRORS_SHOWN = 50;

/**
 * "Importar desde Excel": insumos y recetas desde la plantilla. El .xlsx se lee en el navegador y viaja como
 * JSON; primero en prueba (dryRun) para mostrar qué va a pasar, y recién al confirmar se guarda.
 * Las librerías de Excel se cargan al usarlas, no con la pantalla.
 *
 * Si el archivo no es la plantilla, la IA puede interpretarlo: devuelve las mismas filas que arma la plantilla
 * y de ahí sigue el camino de siempre (dryRun, vista previa, confirmar).
 */
@Component({
  selector: 'app-catalog-import',
  standalone: true,
  imports: [DrawerComponent, RouterLink],
  templateUrl: './catalog-import.component.html',
  styleUrl: './catalog-import.component.scss'
})
export class CatalogImportComponent {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  /** Se guardó algo: la pantalla que lo abrió refresca su lista. */
  @Output() imported = new EventEmitter<void>();

  step = signal<'pick' | 'checking' | 'interpreting' | 'preview' | 'saving' | 'done'>('pick');
  fileName = signal<string | null>(null);
  problems = signal<string[]>([]);
  requestError = signal<string | null>(null);
  result = signal<CatalogImportResult | null>(null);
  errors = signal<ImportRowError[]>([]);
  templateLoading = signal(false);
  hasRecipes = signal(false);
  hasPreparations = signal(false);
  /** Ofrecer la IA: el archivo no es la plantilla, o el usuario dijo que su Excel tiene otro formato. */
  aiOffer = signal(false);
  warnings = signal<string[]>([]);
  /**
   * Insumos que la IA propone porque una receta los usa y no están ni en el catálogo ni en el Excel (un Excel
   * con solo recetas). Se muestran aparte y se suman a los insumos recién para el dryRun y la confirmación.
   */
  proposed = signal<ProductImportRow[]>([]);
  /** Con IA, el `row` de cada fila es un ref nuestro: acá está a qué hoja y fila del cliente corresponde. */
  aiRefs = signal<Map<number, RowRef> | null>(null);
  /**
   * Platos que ya tienen otra receta y el usuario eligió pisar. Arranca vacío a propósito (Mati): reemplazar una receta
   * cambia el food cost de lo que se venda, así que se tilda de a uno.
   */
  replaceIds = signal<ReadonlySet<string>>(new Set());
  /** Lo mismo para las preparaciones que ya tienen otra receta: sin tildar por defecto. */
  replacePrepIds = signal<ReadonlySet<string>>(new Set());
  /** La receta la armó el chat a partir de un mensaje: sin Excel, y `row` es la posición del ingrediente. */
  fromChat = signal(false);
  /** Del chat no hay un Excel que mirar: la vista previa muestra la receta que armó la IA, ingrediente por ingrediente. */
  chatRecipes = signal<{ name: string; yield: string | null; lines: string[] }[]>([]);
  /** Varias recetas del chat (una foto o un PDF de recetas): título en plural y los contadores, como el import normal. */
  readonly chatMany = computed(() => this.fromChat() && this.chatRecipes().length > 1);
  /** Para corregir la unidad de un insumo propuesto ("1 cebolla" no es kg). Se cargan a pedido. */
  units = signal<UnitResponse[]>([]);

  readonly aiBlockedBy = computed<'plan' | 'permission' | null>(() => {
    if (!this.auth.hasFeature('AI_INTERPRETER')) return 'plan';
    if (!this.auth.hasPermission('AI_USE')) return 'permission';
    return null;
  });
  /** `/plan` pide ACCOUNT_VIEW: sin eso el link rebotaría. */
  get canSeePlans(): boolean { return this.auth.hasPermission('ACCOUNT_VIEW'); }
  readonly busy = computed(() => ['checking', 'interpreting', 'saving'].includes(this.step()));

  /** Las recetas piden el plan y crear/editar platos; sin eso el back las rechaza entera (403): no se mandan. */
  readonly recipesBlockedBy = computed<'plan' | 'permission' | null>(() => {
    if (!this.auth.hasFeature('RECIPES_AND_FOOD_COST')) return 'plan';
    if (!this.auth.hasPermission('MENU_CREATE') || !this.auth.hasPermission('MENU_UPDATE')) return 'permission';
    return null;
  });
  readonly recipesEnabled = computed(() => this.recipesBlockedBy() === null);
  /** Las preparaciones piden el mismo plan que las recetas y editar insumos (pasan a tener receta). */
  readonly preparationsBlockedBy = computed<'plan' | 'permission' | null>(() => {
    if (!this.auth.hasFeature('RECIPES_AND_FOOD_COST')) return 'plan';
    if (!this.auth.hasPermission('PRODUCTS_UPDATE')) return 'permission';
    return null;
  });
  readonly preparationsEnabled = computed(() => this.preparationsBlockedBy() === null);
  readonly shownErrors = computed(() => this.errors().slice(0, MAX_ERRORS_SHOWN));
  readonly hiddenErrors = computed(() => Math.max(0, this.errors().length - MAX_ERRORS_SHOWN));

  private payload: { products: ProductImportRow[]; preparations: PreparationImportRow[]; recipes: RecipeImportRow[] } | null = null;
  private sheetsRead: { sheet: string; data: any[][] }[] | null = null;
  /** Lo que el chat ya sabe que hay que pisar (editar una receta que existe): llega tildado. */
  private presetReplace = { recipes: [] as string[], preparations: [] as string[] };

  constructor(private api: Api, private auth: AuthService, private i18n: I18nService) {}

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  private get labels(): ImportLabels {
    const columns: Record<string, string> = {};
    for (const field of [...PRODUCT_FIELDS, ...PREPARATION_FIELDS, ...RECIPE_FIELDS]) columns[field] = this.t(`import.columns.${field}`);
    return { sheets: { PRODUCTS: this.t('import.sheets.PRODUCTS'), PREPARATIONS: this.t('import.sheets.PREPARATIONS'),
                       RECIPES: this.t('import.sheets.RECIPES') }, columns };
  }

  close(): void {
    if (this.busy()) return;
    this.reset();
    this.closed.emit();
  }

  reset(): void {
    this.step.set('pick');
    this.fileName.set(null);
    this.problems.set([]);
    this.requestError.set(null);
    this.result.set(null);
    this.errors.set([]);
    this.warnings.set([]);
    this.proposed.set([]);
    this.aiOffer.set(false);
    this.aiRefs.set(null);
    this.replaceIds.set(new Set());
    this.replacePrepIds.set(new Set());
    this.hasPreparations.set(false);
    this.fromChat.set(false);
    this.chatRecipes.set([]);
    this.payload = null;
    this.sheetsRead = null;
    this.presetReplace = { recipes: [], preparations: [] };
  }

  async downloadTemplate(): Promise<void> {
    this.templateLoading.set(true);
    this.requestError.set(null);
    try {
      const [{ default: writeXlsxFile }, units] = await Promise.all([
        import('write-excel-file/browser'),
        parseBlob<UnitResponse[]>(await this.api.invoke(listUnits) as unknown),
      ]);
      const { sheets, columns } = this.labels;
      // El * marca lo obligatorio; al leer se ignora (igual que mayúsculas, acentos y paréntesis).
      // En Preparaciones la cantidad es de la tanda, no de un plato. El parser lee igual "Cantidad (…)": ignora los paréntesis.
      const label = (sheet: ImportSheet, f: string) =>
        sheet === 'PREPARATIONS' && f === 'quantity' ? this.t('import.columns.batchQuantity') : columns[f];
      const header = (sheet: ImportSheet, fields: readonly string[]) => fields.map(f => ({
        value: label(sheet, f) + (REQUIRED_FIELDS[sheet].includes(f) ? '*' : ''), fontWeight: 'bold' as const,
      }));
      const bold = (value: string) => ({ value, fontWeight: 'bold' as const });
      // Los ejemplos van en la hoja de instrucciones, nunca como filas de Insumos/Recetas: se importarían.
      const instructions = this.t('import.template.instructions').split('\n').map(line => [line]);
      const example = (key: string) => this.t(key).split('|').map(v => v.trim());
      await writeXlsxFile([
        { sheet: sheets.PRODUCTS, data: [header('PRODUCTS', PRODUCT_FIELDS)], stickyRowsCount: 1,
          columns: [{ width: 30 }, { width: 14 }, { width: 20 }, { width: 14 }, { width: 16 }, { width: 10 }] },
        { sheet: sheets.PREPARATIONS, data: [header('PREPARATIONS', PREPARATION_FIELDS)], stickyRowsCount: 1,
          columns: [{ width: 30 }, { width: 10 }, { width: 16 }, { width: 30 }, { width: 24 }, { width: 14 }] },
        { sheet: sheets.RECIPES, data: [header('RECIPES', RECIPE_FIELDS)], stickyRowsCount: 1,
          columns: [{ width: 30 }, { width: 16 }, { width: 18 }, { width: 30 }, { width: 24 }, { width: 14 }] },
        { sheet: this.t('import.template.unitsSheet'), stickyRowsCount: 2, columns: [{ width: 24 }, { width: 14 }],
          data: [[this.t('import.template.unitsNote')],
                 [bold(this.t('import.template.unitName')), bold(this.t('import.template.unitAbbreviation'))],
                 ...units.map(u => [u.name ?? '', u.abbreviation ?? ''])] },
        { sheet: this.t('import.template.instructionsSheet'), columns: [{ width: 30 }, { width: 16 }, { width: 18 }, { width: 30 }, { width: 24 }, { width: 14 }],
          data: [
            ...instructions,
            [''],
            [bold(this.t('import.template.exampleProducts'))],
            header('PRODUCTS', PRODUCT_FIELDS), example('import.template.exampleProduct1'), example('import.template.exampleProduct2'),
            [''],
            [bold(this.t('import.template.examplePreparations'))],
            header('PREPARATIONS', PREPARATION_FIELDS),
            example('import.template.examplePreparation1'), example('import.template.examplePreparation2'),
            [''],
            [bold(this.t('import.template.exampleRecipes'))],
            header('RECIPES', RECIPE_FIELDS), example('import.template.exampleRecipe1'), example('import.template.exampleRecipe2'),
          ] },
      ]).toFile(this.t('import.template.fileName'));
    } catch (e) {
      this.requestError.set(extractApiError(e, this.t('import.templateError')));
    } finally {
      this.templateLoading.set(false);
    }
  }

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';  // para poder volver a elegir el mismo archivo después de corregirlo
    if (!file) return;
    this.reset();
    this.fileName.set(file.name);
    this.step.set('checking');

    let parsed;
    try {
      const { default: readXlsxFile } = await import('read-excel-file/browser');
      this.sheetsRead = await readXlsxFile(file) as any;
      parsed = parseCatalogWorkbook(this.sheetsRead!, this.labels, this.recipesEnabled(), this.preparationsEnabled());
    } catch {
      this.requestError.set(this.t('import.readError'));
      this.step.set('pick');
      return;
    }
    if (parsed.problems.length) {
      this.problems.set(parsed.problems.map(p => this.t(p.key, p.params)));
      // No se reconocen las hojas o columnas de la plantilla: puede ser el Excel propio del cliente.
      this.aiOffer.set(parsed.problems.some(p => p.key === 'import.noSheets' || p.key === 'import.missingColumns'));
      this.step.set('pick');
      return;
    }
    this.hasRecipes.set(parsed.recipes.length > 0);
    this.hasPreparations.set(parsed.preparations.length > 0);
    // Números ilegibles: se muestran sin consultar al back, que no los puede recibir.
    if (parsed.errors.length) {
      this.errors.set(parsed.errors);
      this.step.set('preview');
      return;
    }

    this.payload = { products: parsed.products, preparations: parsed.preparations, recipes: parsed.recipes };
    await this.check();
  }

  /** La IA arma las filas a partir del Excel del cliente; después es el import de siempre. */
  async interpretWithAi(): Promise<void> {
    if (!this.sheetsRead || this.busy() || this.aiBlockedBy()) return;
    const request = buildInterpretSheets(this.sheetsRead);
    this.problems.set([]);
    this.requestError.set(null);
    this.errors.set([]);
    this.result.set(null);
    if (!request.rowCount) {
      this.problems.set([this.t('import.empty')]);
      return;
    }
    if (request.rowCount > MAX_INTERPRET_ROWS) {
      this.problems.set([this.t('import.ai.tooManyRows', { max: MAX_INTERPRET_ROWS })]);
      return;
    }
    if (request.sheets.length > MAX_INTERPRET_SHEETS) {
      this.problems.set([this.t('import.ai.tooManySheets', { max: MAX_INTERPRET_SHEETS })]);
      return;
    }
    this.step.set('interpreting');
    let interpretation: InterpretCatalogResult;
    try {
      interpretation = await parseBlob<InterpretCatalogResult>(
        await this.api.invoke(interpretCatalogSpreadsheet, { body: { sheets: request.sheets } }) as unknown);
    } catch (e) {
      this.requestError.set(extractApiError(e, this.t('import.ai.error')));
      this.step.set('pick');
      return;
    }
    this.aiRefs.set(request.refs);
    this.aiOffer.set(false);
    await this.applyInterpretation(interpretation);
  }

  /**
   * Una receta que armó el chat: la misma vista previa y confirmación que con el Excel. Los ids de pisar vienen tildados
   * porque el mensaje pidió editar esa receta; el usuario igual ve la vista previa y confirma.
   */
  async previewChatRecipe(interpretation: InterpretCatalogResult, replaceRecipeIds: string[], replacePreparationIds: string[]): Promise<void> {
    this.reset();
    this.fromChat.set(true);
    this.presetReplace = { recipes: replaceRecipeIds, preparations: replacePreparationIds };
    const line = (r: { quantity?: number; unit?: string; ingredient?: string }) => [formatNum(r.quantity), r.unit, r.ingredient].filter(Boolean).join(' ');
    const group = <T>(rows: T[], name: (r: T) => string | undefined) => [...new Map(rows.map(r => [name(r) ?? '', rows.filter(x => name(x) === name(r))])).entries()];
    this.chatRecipes.set([
      ...group(interpretation.preparations ?? [], r => r.preparation).map(([name, rows]) => ({ name, lines: rows.map(line),
        yield: rows[0].yieldQuantity != null ? this.t('import.chat.yield', { qty: formatNum(rows[0].yieldQuantity), unit: rows[0].yieldUnit ?? '' }) : null })),
      ...group(interpretation.recipes ?? [], r => r.menuItem).map(([name, rows]) => ({ name, lines: rows.map(line), yield: null })),
    ]);
    await this.applyInterpretation(interpretation);
  }

  /** La IA propuso un insumo con una unidad que no cierra con la receta: se corrige y se vuelve a probar el import. */
  hasUnit(unit: string | undefined): boolean {
    return this.units().some(u => u.abbreviation === unit);
  }

  async setProposedUnit(p: ProductImportRow, unit: string): Promise<void> {
    if (this.busy() || p.unit === unit) return;
    p.unit = unit;  // el mismo objeto está en payload.products
    this.proposed.update(list => [...list]);
    await this.check();
  }

  private async loadUnits(): Promise<void> {
    if (this.units().length) return;
    try { this.units.set(await parseBlob<UnitResponse[]>(await this.api.invoke(listUnits) as unknown)); } catch { /* sin unidades no se edita: queda la propuesta */ }
  }

  private async applyInterpretation(interpretation: InterpretCatalogResult): Promise<void> {
    this.warnings.set(interpretation.warnings ?? []);
    const recipes = this.recipesEnabled() ? interpretation.recipes ?? [] : [];
    const preparations = this.preparationsEnabled() ? interpretation.preparations ?? [] : [];
    // Sin recetas ni preparaciones no hay a quién le hagan falta: no se proponen.
    const proposed = recipes.length || preparations.length ? interpretation.proposedProducts ?? [] : [];
    this.proposed.set(proposed);
    this.payload = { products: [...(interpretation.products ?? []), ...proposed], preparations, recipes };
    if (proposed.length) void this.loadUnits();
    this.hasRecipes.set(recipes.length > 0);
    this.hasPreparations.set(preparations.length > 0);
    if (!this.payload.products.length && !recipes.length && !preparations.length) {
      this.problems.set([this.t('import.ai.nothingFound')]);
      this.step.set('pick');
      return;
    }
    await this.check();
  }

  private async check(): Promise<void> {
    this.step.set('checking');
    try {
      const res = await this.send(true);
      this.result.set(res);
      this.errors.set(res.errors ?? []);
      this.replaceIds.set(new Set(this.presetReplace.recipes));
      this.replacePrepIds.set(new Set(this.presetReplace.preparations));
      this.step.set('preview');
    } catch (e) {
      this.requestError.set(extractApiError(e, this.t('import.checkError')));
      this.step.set('pick');
    }
  }

  async confirm(): Promise<void> {
    if (!this.payload || this.errors().length) return;
    this.step.set('saving');
    this.requestError.set(null);
    try {
      const res = await this.send(false);
      this.result.set(res);
      this.errors.set(res.errors ?? []);
      // Si algo cambió entre la prueba y el guardado, el back no guarda y devuelve los errores nuevos.
      if (res.saved) {
        this.step.set('done');
        this.imported.emit();
      } else {
        this.step.set('preview');
      }
    } catch (e) {
      this.requestError.set(extractApiError(e, this.t('import.saveError')));
      this.step.set('preview');
    }
  }

  /**
   * El dryRun pregunta qué platos y qué preparaciones ya tienen otra receta; al confirmar se mandan los tildados. Un id
   * de más se ignora.
   */
  private async send(dryRun: boolean): Promise<CatalogImportResult> {
    const body = { ...this.payload!,
      replaceRecipeMenuItemIds: dryRun ? [] : [...this.replaceIds()],
      replacePreparationProductIds: dryRun ? [] : [...this.replacePrepIds()] };
    return parseBlob<CatalogImportResult>(await this.api.invoke(importCatalog, { dryRun, body }) as unknown);
  }

  toggleReplace(set: WritableSignal<ReadonlySet<string>>, id: string | undefined, on: boolean): void {
    if (!id) return;
    const ids = new Set(set());
    if (on) ids.add(id); else ids.delete(id);
    set.set(ids);
  }

  /** En la vista previa, las que se van a pisar son las tildadas; al terminar, lo que dice el back. */
  recipesReplacedCount(r: CatalogImportResult): number {
    return this.step() === 'done' ? r.recipesReplaced ?? 0 : (r.recipesToReplace ?? []).filter(x => x.menuItemId && this.replaceIds().has(x.menuItemId)).length;
  }

  preparationsReplacedCount(r: CatalogImportResult): number {
    return this.step() === 'done' ? r.preparationsReplaced ?? 0
      : (r.preparationsToReplace ?? []).filter(x => x.productId && this.replacePrepIds().has(x.productId)).length;
  }

  /** La primera fila de la preparación en su hoja (con IA, en la hoja del cliente). */
  preparationPlace(r: PreparationReplacement): string {
    if (this.fromChat()) return '';  // una sola receta por mensaje: no hay dónde buscarla
    return this.errorPlace({ sheet: 'PREPARATIONS', row: r.row });
  }

  /** La primera fila del plato en la hoja de recetas (con IA, en la hoja del cliente). */
  recipePlace(r: RecipeReplacement): string {
    if (this.fromChat()) return '';
    return this.errorPlace({ sheet: 'RECIPES', row: r.row });
  }

  errorMessage(error: ImportRowError): string {
    if (this.fromChat() && error.errorCode === 'IMPORT_UNKNOWN_INGREDIENT') return this.t('import.chat.unknownIngredient');
    if (error.errorCode === UNREADABLE_NUMBER) return this.t('import.unreadableNumber');
    // El genérico ("negativo, cero o texto largo") no explica un 22: para el IVA se dice cuáles valen.
    if (error.errorCode === 'IMPORT_INVALID_VALUE' && error.field === 'ivaPercentage') {
      return getErrorMessage('INVALID_IVA_PERCENTAGE') ?? this.t('import.rowError');
    }
    return getErrorMessage(error.errorCode) ?? this.t('import.rowError');
  }

  columnLabel(error: ImportRowError): string | null {
    return error.field ? this.t(`import.columns.${error.field}`) : null;
  }

  /** "Insumos · fila 12"; con IA, la hoja y la fila del Excel del cliente; del chat, el ingrediente. */
  errorPlace(error: ImportRowError): string {
    // Del chat, `row` es la posición del ingrediente en la receta (en un insumo propuesto, la del primero que lo usa).
    if (this.fromChat()) {
      // Con varias recetas, "ingrediente 2" no alcanza: se dice de cuál (las filas de una hoja son de una sola receta).
      const owners = new Set(error.sheet === 'PREPARATIONS'
        ? (this.payload?.preparations ?? []).filter(r => r.row === error.row).map(r => r.preparation)
        : error.sheet === 'RECIPES' ? (this.payload?.recipes ?? []).filter(r => r.row === error.row).map(r => r.menuItem) : []);
      const ingredient = this.t('import.chat.ingredient', { n: error.row ?? '' });
      return this.chatMany() && owners.size === 1 ? `${[...owners][0]} · ${ingredient}` : ingredient;
    }
    const ref = error.row != null ? this.aiRefs()?.get(error.row) : undefined;
    if (ref) return `${ref.sheet} · ${this.t('import.row', { row: ref.row })}`;
    return `${this.t('import.sheets.' + error.sheet)} · ${this.t('import.row', { row: error.row ?? '' })}`;
  }
}
