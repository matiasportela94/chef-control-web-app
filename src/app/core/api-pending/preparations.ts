// ponytail: el contrato de preparaciones y producciones (F17) escrito a mano hasta que el back publique el spec. Las
// funciones tienen la forma de las de ng-openapi-gen, así que al regenerar se borra este archivo y solo cambian los imports.
import { HttpClient, HttpContext, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { RequestBuilder } from '../../api/request-builder';
import { StrictHttpResponse } from '../../api/strict-http-response';
import { IngredientCost } from '../../api/models/ingredient-cost';
import { ProductResponse } from '../../api/models/product-response';

export type ProductWithPreparation = ProductResponse & { preparation?: boolean };
export type IngredientCostWithPreparation = IngredientCost & { preparation?: boolean };

export interface PreparationRecipeItemResponse {
  productId?: string; productName?: string; quantity?: number; unitId?: string; unitName?: string;
}
export interface PreparationRecipeResponse {
  productId?: string; yieldQuantity?: number; yieldUnitId?: string; yieldUnitName?: string;
  items?: PreparationRecipeItemResponse[];
}
export interface PreparationRecipeRequest {
  yieldQuantity: number;
  items: { productId: string; quantity: number; unitId: string }[];
}
export interface PreparationCostResponse {
  productId?: string; yieldQuantity?: number; unitId?: string; unitName?: string;
  batchCost?: number; unitCost?: number; ingredients?: IngredientCostWithPreparation[];
}
export interface ProductionIngredientResponse {
  productId?: string; productName?: string; quantity?: number; unitId?: string; unitName?: string;
  standardWaste?: number; costPerUnit?: number; totalCost?: number;
}
export interface ProductionResponse {
  id?: string; productId?: string; productName?: string; quantity?: number; unitId?: string; unitName?: string;
  costPerUnit?: number; totalCost?: number; expirationDate?: string; producedAt?: string; automatic?: boolean;
  saleId?: string; parentProductionId?: string; status?: 'ACTIVE' | 'REVERSED'; notes?: string;
  ingredients?: ProductionIngredientResponse[];
}
export interface RecordProductionRequest {
  productId: string; quantity: number; unitId: string; expirationDate?: string; producedAt?: string; notes?: string;
}
export interface PagedResponseProductionResponse { content?: ProductionResponse[]; totalElements?: number }

function endpoint<P, R>(method: string, path: string, apply: (rb: RequestBuilder, p: P) => void) {
  return Object.assign((http: HttpClient, rootUrl: string, params: P, context?: HttpContext): Observable<StrictHttpResponse<R>> => {
    const rb = new RequestBuilder(rootUrl, path, method);
    apply(rb, params);
    return http.request(rb.build({ responseType: 'blob', accept: '*/*', context })).pipe(
      filter((r: any): r is HttpResponse<any> => r instanceof HttpResponse),
      map(r => r as StrictHttpResponse<R>));
  }, { PATH: path });
}
const id = (rb: RequestBuilder, p: { id: string }) => rb.path('id', p.id, {});

export const getPreparationRecipe = endpoint<{ id: string }, PreparationRecipeResponse>('get', '/products/{id}/recipe', id);
export const setPreparationRecipe = endpoint<{ id: string; body: PreparationRecipeRequest }, PreparationRecipeResponse>(
  'put', '/products/{id}/recipe', (rb, p) => { id(rb, p); rb.body(p.body, 'application/json'); });
export const deletePreparationRecipe = endpoint<{ id: string }, void>('delete', '/products/{id}/recipe', id);
export const getPreparationCost = endpoint<{ id: string; at?: string }, PreparationCostResponse>(
  'get', '/products/{id}/recipe/cost', (rb, p) => { id(rb, p); if (p.at) rb.query('at', p.at, {}); });

export const recordProduction = endpoint<{ body: RecordProductionRequest }, ProductionResponse>(
  'post', '/productions', (rb, p) => rb.body(p.body, 'application/json'));
export const listProductions = endpoint<
  { productId?: string; automatic?: boolean; from?: string; to?: string; page?: number; size?: number }, PagedResponseProductionResponse>(
  'get', '/productions', (rb, p) => {
    for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') rb.query(k, v, {});
  });
export const getProduction = endpoint<{ id: string }, ProductionResponse>('get', '/productions/{id}', id);
export const reverseProduction = endpoint<{ id: string }, ProductionResponse>('post', '/productions/{id}/reverse', id);

// ---- import de catálogo (POST /catalog-import y la IA de catálogo)

export interface PreparationImportRow {
  row?: number; preparation?: string; yieldQuantity?: number; yieldUnit?: string; ingredient?: string; quantity?: number; unit?: string;
}
export interface PreparationReplacement { productId?: string; preparation?: string; row?: number }
export interface CatalogImportPreparationsResult {
  preparationsToReplace?: PreparationReplacement[];
  preparationsCreated?: number; preparationsReplaced?: number; preparationsSkipped?: number; preparationsUnchanged?: number;
}
