import { Component, OnInit, signal } from '@angular/core';
import { Api } from '../../api/api';
import { listAuditLogs } from '../../api/fn/audit-log-controller/list-audit-logs';
import { AuditLogResponse } from '../../api/models/audit-log-response';
import { PagedResponseAuditLogResponse } from '../../api/models/paged-response-audit-log-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { formatDatetime } from '../../core/utils/format';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';

const ACTION_LABELS: Record<string, string> = {
  USER_LOGIN:                    'Inicio de sesión',
  USER_LOGIN_FAILED:             'Intento de inicio de sesión fallido',
  USER_RESTAURANT_SWITCHED:      'Cambio de restaurante',
  PASSWORD_RESET_REQUESTED:      'Solicitud de recuperación de contraseña',
  PASSWORD_RESET_COMPLETED:      'Contraseña restablecida',
  RESTAURANT_REGISTERED:         'Restaurante registrado',
  USER_CREATED:                  'Usuario creado',
  USER_UPDATED:                  'Usuario editado',
  USER_DEACTIVATED:              'Usuario desactivado',
  USER_REACTIVATED:              'Usuario reactivado',
  RESTAURANT_CREATED:            'Restaurante creado',
  RESTAURANT_UPDATED:            'Restaurante editado',
  RESTAURANT_DEACTIVATED:        'Restaurante desactivado',
  SUPPLIER_CREATED:              'Proveedor creado',
  SUPPLIER_UPDATED:              'Proveedor editado',
  SUPPLIER_DEACTIVATED:          'Proveedor desactivado',
  PRODUCT_CREATED:               'Insumo creado',
  PRODUCT_UPDATED:               'Insumo editado',
  PRODUCT_DEACTIVATED:           'Insumo desactivado',
  PURCHASE_CREATED:              'Compra registrada',
  PURCHASE_UPDATED:              'Compra corregida',
  PURCHASE_REVERSED:             'Compra revertida',
  WASTE_EVENT_CREATED:           'Merma registrada',
  STOCK_MOVEMENT_CREATED:        'Movimiento de stock creado',
  STOCK_MOVEMENT_CORRECTED:      'Movimiento de stock corregido',
  STOCK_MOVEMENT_REVERSED:       'Movimiento de stock revertido',
  STOCK_COUNT_CREATED:           'Conteo de stock registrado',
  RECIPE_CREATED:                'Receta creada',
  RECIPE_UPDATED:                'Receta editada',
  RECIPE_DELETED:                'Receta eliminada',
  SALE_RECORDED:                 'Venta registrada',
  SALE_REVERSED:                 'Venta revertida',
  SALE_DELETED:                  'Venta eliminada',
  MENU_ITEM_CREATED:             'Plato creado',
  MENU_ITEM_UPDATED:             'Plato editado',
  MENU_ITEM_DEACTIVATED:         'Plato desactivado',
  WHATSAPP_SESSION_STARTED:      'Sesión de WhatsApp iniciada',
  WHATSAPP_MESSAGE_PROCESSED:    'Mensaje de WhatsApp procesado',
  WHATSAPP_UNREGISTERED_ATTEMPT: 'Intento desde teléfono no registrado',
  POS_SYNC_COMPLETED:            'Sincronización con POS completada',
  POS_SYNC_FAILED:               'Sincronización con POS fallida',
  SYSTEM:                        'Sistema',
};

const ENTITY_LABELS: Record<string, string> = {
  Sale: 'Venta', Purchase: 'Compra', Product: 'Insumo', Supplier: 'Proveedor',
  Recipe: 'Receta', MenuItem: 'Plato', User: 'Usuario', Restaurant: 'Restaurante',
  StockMovement: 'Movimiento de stock', StockCount: 'Conteo de stock', WasteEvent: 'Merma',
};

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [PaginatorComponent, SpinnerComponent],
  templateUrl: './audit.component.html',
  styleUrl: './audit.component.scss'
})
export class AuditComponent implements OnInit {
  logs    = signal<AuditLogResponse[]>([]);
  loading = signal(true);
  error   = signal<string | null>(null);

  page     = signal(1);
  pageSize = 20;
  total    = signal(0);

  constructor(private api: Api) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.invoke(listAuditLogs, { page: this.page() - 1, size: this.pageSize }) as unknown;
      const res = await parseBlob<PagedResponseAuditLogResponse>(raw);
      this.logs.set(res.content ?? []);
      this.total.set(res.totalElements ?? 0);
    } catch {
      this.error.set('No se pudo cargar el historial de auditoría.');
    } finally {
      this.loading.set(false);
    }
  }

  async goToPage(p: number): Promise<void> {
    this.page.set(p);
    await this.load();
  }

  actionLabel(action?: string): string {
    return action ? (ACTION_LABELS[action] ?? action.replace(/_/g, ' ')) : '—';
  }

  entityLabel(entityType?: string): string {
    return entityType ? (ENTITY_LABELS[entityType] ?? entityType) : '—';
  }

  /** Resume el payload JSON como "clave: valor, clave: valor", truncado. */
  payloadSummary(payload?: string): string {
    if (!payload) return '—';
    try {
      const obj = JSON.parse(payload);
      const summary = Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(', ');
      return summary.length > 80 ? summary.slice(0, 80) + '…' : summary || '—';
    } catch {
      return payload.length > 80 ? payload.slice(0, 80) + '…' : payload;
    }
  }

  readonly formatDate = formatDatetime;
}
