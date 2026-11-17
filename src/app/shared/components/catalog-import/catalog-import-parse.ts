/**
 * Lectura de la plantilla de importación (insumos + recetas). Funciones puras: reciben las hojas ya leídas
 * del .xlsx y arman las filas que van a POST /catalog-import.
 *
 * El backend valida todo y es el único que decide. Lo único que se valida acá son los números escritos como
 * texto que no se pueden leer: el back no puede recibir "abc" en un campo numérico.
 */

import { ImportRowError } from '../../../api/models/import-row-error';
import { ProductImportRow } from '../../../api/models/product-import-row';
import { RecipeImportRow } from '../../../api/models/recipe-import-row';
import { PreparationImportRow } from '../../../core/api-pending/preparations';

/** Los valores de `ImportRowError.sheet` del backend. */
export type ImportSheet = 'PRODUCTS' | 'PREPARATIONS' | 'RECIPES';

/** Un problema del archivo entero (falta una hoja o una columna, demasiadas filas): clave i18n + valores. */
export interface ImportProblem {
  key: string;
  params?: Record<string, string | number>;
}

/** Nombres visibles de hojas y columnas (salen de i18n): los mismos con los que se arma la plantilla. */
export interface ImportLabels {
  sheets: Record<ImportSheet, string>;
  columns: Record<string, string>;
}

type Cell = string | number | boolean | Date | null | undefined;

export const PRODUCT_FIELDS = ['name', 'unit', 'category', 'minStock', 'yieldPercentage', 'ivaPercentage'] as const;
export const RECIPE_FIELDS = ['menuItem', 'price', 'section', 'ingredient', 'quantity', 'unit'] as const;
/** Una fila por ingrediente; el rinde (y su unidad) en la primera fila de cada preparación, como el precio en Recetas. */
export const PREPARATION_FIELDS = ['preparation', 'yieldQuantity', 'yieldUnit', 'ingredient', 'quantity', 'unit'] as const;
export const REQUIRED_FIELDS: Record<ImportSheet, readonly string[]> = {
  PRODUCTS: ['name', 'unit'],
  PREPARATIONS: ['preparation', 'ingredient', 'quantity', 'unit'],
  RECIPES: ['menuItem', 'ingredient', 'quantity', 'unit'],
};
const NUMERIC_FIELDS = new Set(['minStock', 'yieldPercentage', 'ivaPercentage', 'price', 'quantity', 'yieldQuantity']);

/** Código propio del front (el back nunca lo devuelve): un número escrito como texto que no se puede leer. */
export const UNREADABLE_NUMBER = 'UNREADABLE_NUMBER';

/** Los mismos topes que el backend: pasado eso responde 400 y no tiene sentido subir el archivo. */
export const MAX_ROWS: Record<ImportSheet, number> = { PRODUCTS: 1000, PREPARATIONS: 1000, RECIPES: 3000 };

/** "Stock mínimo", "stock minimo*" y "STOCK MÍNIMO" son la misma columna. Lo que va entre paréntesis no cuenta. */
export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Número de una celda. Si Excel la guardó como número, se usa tal cual. Si es texto, se lee como en Argentina:
 * punto de miles y coma decimal ("1.234,5", "1,5", "$ 12.400", "90%").
 * Vacía → undefined. Ilegible → NaN. "1.5" es ilegible a propósito: en es-AR el punto separa miles y
 * adivinar que era un decimal haría que "1.500" y "1.50" signifiquen cosas distintas.
 */
export function parseArNumber(value: Cell): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  const text = value.replace(/[\s$%]/g, '');
  if (!text) return undefined;
  if (!/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(text)) return NaN;
  return Number(text.replace(/\./g, '').replace(',', '.'));
}

function cellText(value: Cell): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = (value instanceof Date ? value.toISOString().slice(0, 10) : String(value)).trim();
  return text || undefined;
}

function isEmptyRow(row: Cell[]): boolean {
  return row.every(cell => cellText(cell) === undefined);
}

interface SheetResult<T> { rows: T[]; errors: ImportRowError[]; problems: ImportProblem[] }

function parseSheet<T extends { row?: number }>(
  data: Cell[][], sheet: ImportSheet, fields: readonly string[], labels: ImportLabels
): SheetResult<T> {
  const result: SheetResult<T> = { rows: [], errors: [], problems: [] };
  const headerIndex = data.findIndex(row => !isEmptyRow(row));
  if (headerIndex < 0) return result;

  // Se mapea por nombre de encabezado, no por posición: el usuario puede mover o agregar columnas.
  const headers = data[headerIndex].map(normalizeHeader);
  const columnOf = new Map(fields.map(f => [f, headers.indexOf(normalizeHeader(labels.columns[f]))]));
  const missing = REQUIRED_FIELDS[sheet].filter(f => columnOf.get(f)! < 0);
  if (missing.length) {
    result.problems.push({ key: 'import.missingColumns', params: {
      sheet: labels.sheets[sheet], columns: missing.map(f => labels.columns[f]).join(', '),
    } });
    return result;
  }

  for (let i = headerIndex + 1; i < data.length; i++) {
    const cells = data[i];
    if (isEmptyRow(cells)) continue;
    const row: Record<string, unknown> = { row: i + 1 };  // fila del Excel, contando desde 1
    for (const field of fields) {
      const col = columnOf.get(field)!;
      if (col < 0) continue;
      const cell = cells[col];
      // Lo vacío no se manda: si era obligatorio, lo informa el backend.
      if (!NUMERIC_FIELDS.has(field)) {
        const text = cellText(cell);
        if (text !== undefined) row[field] = text;
        continue;
      }
      let number = parseArNumber(cell);
      // Una celda con formato de porcentaje guarda 21 % como 0,21. Ninguna alícuota válida está entre 0 y 1,
      // así que no hay ambigüedad: se pasa a 21. (Escrito como texto, "21%" ya se lee 21.)
      if (field === 'ivaPercentage' && typeof cell === 'number' && number! > 0 && number! < 1) {
        number = Math.round(number! * 1000) / 10;
      }
      if (Number.isNaN(number)) {
        result.errors.push({ sheet, row: i + 1, field, errorCode: UNREADABLE_NUMBER, value: cellText(cell) });
      } else if (number !== undefined) {
        row[field] = number;
      }
    }
    result.rows.push(row as T);
  }

  if (result.rows.length > MAX_ROWS[sheet]) {
    result.problems.push({ key: 'import.tooManyRows', params: { sheet: labels.sheets[sheet], max: MAX_ROWS[sheet] } });
  }
  return result;
}

export interface ParsedCatalog {
  products: ProductImportRow[];
  preparations: PreparationImportRow[];
  recipes: RecipeImportRow[];
  errors: ImportRowError[];
  problems: ImportProblem[];
}

/**
 * Arma las filas a mandar. Sin `withRecipes` / `withPreparations` (el plan o los permisos no alcanzan) esas hojas ni se
 * leen: el back rechazaría la request entera.
 */
export function parseCatalogWorkbook(
  sheets: { sheet: string; data: Cell[][] }[], labels: ImportLabels, withRecipes: boolean, withPreparations = false
): ParsedCatalog {
  const find = (sheet: ImportSheet) =>
    sheets.find(s => normalizeHeader(s.sheet) === normalizeHeader(labels.sheets[sheet]))?.data;
  const productsData = find('PRODUCTS');
  const preparationsData = withPreparations ? find('PREPARATIONS') : undefined;
  const recipesData = withRecipes ? find('RECIPES') : undefined;

  if (!productsData && !preparationsData && !recipesData) {
    const read: ImportSheet[] = ['PRODUCTS', ...(withPreparations ? ['PREPARATIONS' as const] : []), ...(withRecipes ? ['RECIPES' as const] : [])];
    return { products: [], preparations: [], recipes: [], errors: [],
             problems: [{ key: 'import.noSheets', params: { sheets: read.map(s => labels.sheets[s]).join(', ') } }] };
  }

  const products = productsData ? parseSheet<ProductImportRow>(productsData, 'PRODUCTS', PRODUCT_FIELDS, labels) : null;
  const preparations = preparationsData
    ? parseSheet<PreparationImportRow>(preparationsData, 'PREPARATIONS', PREPARATION_FIELDS, labels) : null;
  const recipes = recipesData ? parseSheet<RecipeImportRow>(recipesData, 'RECIPES', RECIPE_FIELDS, labels) : null;
  const parsed: ParsedCatalog = {
    products: products?.rows ?? [],
    preparations: preparations?.rows ?? [],
    recipes: recipes?.rows ?? [],
    errors: [...(products?.errors ?? []), ...(preparations?.errors ?? []), ...(recipes?.errors ?? [])],
    problems: [...(products?.problems ?? []), ...(preparations?.problems ?? []), ...(recipes?.problems ?? [])],
  };
  if (!parsed.problems.length && !parsed.products.length && !parsed.preparations.length && !parsed.recipes.length) {
    parsed.problems.push({ key: 'import.empty' });
  }
  return parsed;
}

// ── "Interpretar con IA": el Excel del cliente, sin plantilla ─────────────────

export interface InterpretSheet {
  name: string;
  rows: { ref: number; cells: (string | number | null)[] }[];
}

/** De dónde salió cada ref: la hoja y la fila del Excel del cliente, para mostrar los errores ahí. */
export interface RowRef { sheet: string; row: number }

/** Topes del back para la IA: filas con datos (lo mide contra la salida del modelo) y hojas. Pasados, responde 400. */
export const MAX_INTERPRET_ROWS = 300;
export const MAX_INTERPRET_SHEETS = 20;

/**
 * Todas las hojas tal cual, sin filas vacías. Cada fila lleva un `ref` global (no se repite entre hojas): la IA
 * lo devuelve como `row` y los errores del dryRun se traducen con `refs` a la hoja y la fila del cliente.
 * Las celdas vacías del final se cortan: no dicen nada y cuestan tokens.
 */
export function buildInterpretSheets(sheets: { sheet: string; data: Cell[][] }[]):
    { sheets: InterpretSheet[]; refs: Map<number, RowRef>; rowCount: number } {
  const refs = new Map<number, RowRef>();
  const out: InterpretSheet[] = [];
  let ref = 0;
  for (const s of sheets) {
    const rows: InterpretSheet['rows'] = [];
    s.data.forEach((cells, i) => {
      if (isEmptyRow(cells)) return;
      const values = cells.map(interpretCell);
      while (values.length && values[values.length - 1] === null) values.pop();
      refs.set(++ref, { sheet: s.sheet, row: i + 1 });
      rows.push({ ref, cells: values });
    });
    if (rows.length) out.push({ name: s.sheet, rows });
  }
  return { sheets: out, refs, rowCount: ref };
}

function interpretCell(value: Cell): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.trim() ? value : null;
  return String(value);
}
