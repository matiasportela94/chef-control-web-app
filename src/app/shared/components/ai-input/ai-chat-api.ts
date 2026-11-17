// ponytail: a mano, con la forma de lo que genera ng-openapi-gen, hasta que el spec del back traiga /ai/chat.
// Al regenerar el cliente se borra este archivo y se importa lo generado.
import { HttpClient, HttpContext, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { StrictHttpResponse } from '../../../api/strict-http-response';
import { RequestBuilder } from '../../../api/request-builder';

export type ChatOperationType = 'PURCHASE' | 'WASTE' | 'SALE' | 'STOCK_ADJUSTMENT' | 'PRODUCTION';

export interface ChatOperationItem {
  productId?: string | null;
  menuItemId?: string | null;
  name?: string;
  quantity?: number;
  unitName?: string | null;
  pricePerUnit?: number | null;
  expirationDate?: string | null;
  wasteReason?: 'EXPIRED' | 'DAMAGED' | 'OVERPRODUCTION' | 'THEFT' | 'OTHER' | null;
}

export interface ChatOperation {
  type?: ChatOperationType;
  items?: Array<ChatOperationItem>;
}

export interface ChatActionResponse {
  actionId?: string;
  type?: ChatOperationType;
  entityId?: string;
  summary?: string;
  createdAt?: string;
  undoableUntil?: string;
  undoneAt?: string | null;
}

export interface ChatSkip {
  type?: ChatOperationType | null;
  name?: string | null;
  errorCode?: string;
  message?: string;
}

export interface ChatResponse {
  status?: 'REGISTERED' | 'NEEDS_CONFIRMATION' | 'NOT_REGISTERED' | 'NOT_SUPPORTED' | 'NOT_UNDERSTOOD' | 'RECIPE_PREVIEW';
  message?: string;
  actions?: Array<ChatActionResponse>;
  proposal?: Array<ChatOperation>;
  skipped?: Array<ChatSkip>;
}

function post<T>(http: HttpClient, rootUrl: string, path: string, body: unknown, context?: HttpContext): Observable<StrictHttpResponse<T>> {
  const rb = new RequestBuilder(rootUrl, path, 'post');
  if (body !== undefined) rb.body(body, 'application/json');
  return http.request(rb.build({ responseType: 'blob', accept: '*/*', context })).pipe(
    filter((r: any): r is HttpResponse<any> => r instanceof HttpResponse),
    map((r: HttpResponse<any>) => r as StrictHttpResponse<T>),
  );
}

export function sendChatMessage(http: HttpClient, rootUrl: string, params: { body: { message: string } }, context?: HttpContext) {
  return post<ChatResponse>(http, rootUrl, sendChatMessage.PATH, params.body, context);
}
sendChatMessage.PATH = '/ai/chat';

export function confirmChatOperations(http: HttpClient, rootUrl: string, params: { body: { operations: ChatOperation[] } }, context?: HttpContext) {
  return post<ChatResponse>(http, rootUrl, confirmChatOperations.PATH, params.body, context);
}
confirmChatOperations.PATH = '/ai/chat/confirm';

export function undoChatAction(http: HttpClient, rootUrl: string, params: { actionId: string }, context?: HttpContext) {
  return post<ChatActionResponse>(http, rootUrl, undoChatAction.PATH.replace('{actionId}', encodeURIComponent(params.actionId)), undefined, context);
}
undoChatAction.PATH = '/ai/chat/actions/{actionId}/undo';
