import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { Api } from '../../../api/api';
import { listUnits } from '../../../api/fn/unit-controller/list-units';
import { importCatalog } from '../../../api/fn/catalog-import-controller/import-catalog';
import { CatalogImportResult } from '../../../api/models/catalog-import-result';
import { ImportRowError } from '../../../api/models/import-row-error';
import { ProductImportRow } from '../../../api/models/product-import-row';
import { RecipeImportRow } from '../../../api/models/recipe-import-row';
import { UnitResponse } from '../../../api/models/unit-response';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { extractApiError } from '../../../core/utils/api-error';
import { getErrorMessage } from '../../../core/utils/error-messages';
import { parseBlob } from '../../../core/utils/parse-blob';
import { DrawerComponent } from '../drawer/drawer.component';
import {
  ImportLabels, PRODUCT_FIELDS, RECIPE_FIELDS, REQUIRED_FIELDS, UNREADABLE_NUMBER, parseCatalogWorkbook
} from './catalog-import-parse';

/** Más que esto no se dibuja: con 500 errores la lista no se lee igual, y el primero ya dice qué corregir. */
const MAX_ERRORS_SHOWN = 50;

/**
 * "Importar desde Excel": insumos y recetas desde la plantilla. El .xlsx se lee en el navegador y viaja como
 * JSON; primero en prueba (dryRun) para mostrar qué va a pasar, y recién al confirmar se guarda.
 * Las librerías de Excel se cargan al usarlas, no con la pantalla.
 */
@Component({
  selector: 'app-catalog-import',
  standalone: true,
  imports: [DrawerComponent],
  templateUrl: './catalog-import.component.html',
  styleUrl: './catalog-import.component.scss'
})
export class CatalogImportComponent {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  /** Se guardó algo: la pantalla que lo abrió refresca su lista. */
  @Output() imported = new EventEmitter<void>();

  step = signal<'pick' | 'checking' | 'preview' | 'saving' | 'done'>('pick');
  fileName = signal<string | null>(null);
  problems = signal<string[]>([]);
  requestError = signal<string | null>(null);
  result = signal<CatalogImportResult | null>(null);
  errors = signal<ImportRowError[]>([]);
  templateLoading = signal(false);
  hasRecipes = signal(false);

  /** Las recetas piden el plan y crear/editar platos; sin eso el back las rechaza entera (403): no se mandan. */
  readonly recipesBlockedBy = computed<'plan' | 'permission' | null>(() => {
    if (!this.auth.hasFeature('RECIPES_AND_FOOD_COST')) return 'plan';
    if (!this.auth.hasPermission('MENU_CREATE') || !this.auth.hasPermission('MENU_UPDATE')) return 'permission';
    return null;
  });
  readonly recipesEnabled = computed(() => this.recipesBlockedBy() === null);
  readonly shownErrors = computed(() => this.errors().slice(0, MAX_ERRORS_SHOWN));
  readonly hiddenErrors = computed(() => Math.max(0, this.errors().length - MAX_ERRORS_SHOWN));

  private payload: { products: ProductImportRow[]; recipes: RecipeImportRow[] } | null = null;

  constructor(private api: Api, private auth: AuthService, private i18n: I18nService) {}

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  private get labels(): ImportLabels {
    const columns: Record<string, string> = {};
    for (const field of [...PRODUCT_FIELDS, ...RECIPE_FIELDS]) columns[field] = this.t(`import.columns.${field}`);
    return { sheets: { PRODUCTS: this.t('import.sheets.PRODUCTS'), RECIPES: this.t('import.sheets.RECIPES') }, columns };
  }

  close(): void {
    if (this.step() === 'saving') return;
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
    this.payload = null;
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
      const header = (sheet: 'PRODUCTS' | 'RECIPES', fields: readonly string[]) => fields.map(f => ({
        value: columns[f] + (REQUIRED_FIELDS[sheet].includes(f) ? '*' : ''), fontWeight: 'bold' as const,
      }));
      const bold = (value: string) => ({ value, fontWeight: 'bold' as const });
      // Los ejemplos van en la hoja de instrucciones, nunca como filas de Insumos/Recetas: se importarían.
      const instructions = this.t('import.template.instructions').split('\n').map(line => [line]);
      const example = (key: string) => this.t(key).split('|').map(v => v.trim());
      await writeXlsxFile([
        { sheet: sheets.PRODUCTS, data: [header('PRODUCTS', PRODUCT_FIELDS)], stickyRowsCount: 1,
          columns: [{ width: 30 }, { width: 14 }, { width: 20 }, { width: 14 }, { width: 16 }] },
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
      parsed = parseCatalogWorkbook(await readXlsxFile(file) as any, this.labels, this.recipesEnabled());
    } catch {
      this.requestError.set(this.t('import.readError'));
      this.step.set('pick');
      return;
    }
    if (parsed.problems.length) {
      this.problems.set(parsed.problems.map(p => this.t(p.key, p.params)));
      this.step.set('pick');
      return;
    }
    this.hasRecipes.set(parsed.recipes.length > 0);
    // Números ilegibles: se muestran sin consultar al back, que no los puede recibir.
    if (parsed.errors.length) {
      this.errors.set(parsed.errors);
      this.step.set('preview');
      return;
    }

    this.payload = { products: parsed.products, recipes: parsed.recipes };
    try {
      const res = await this.send(true);
      this.result.set(res);
      this.errors.set(res.errors ?? []);
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

  private async send(dryRun: boolean): Promise<CatalogImportResult> {
    return parseBlob<CatalogImportResult>(
      await this.api.invoke(importCatalog, { dryRun, body: this.payload! }) as unknown);
  }

  errorMessage(error: ImportRowError): string {
    if (error.errorCode === UNREADABLE_NUMBER) return this.t('import.unreadableNumber');
    return getErrorMessage(error.errorCode) ?? this.t('import.rowError');
  }

  columnLabel(error: ImportRowError): string | null {
    return error.field ? this.t(`import.columns.${error.field}`) : null;
  }
}
