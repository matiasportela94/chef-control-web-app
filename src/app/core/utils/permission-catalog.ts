import { OverrideItem } from '../../api/models/override-item';

export type PermissionKey = OverrideItem['permission'];

export interface PermissionModule {
  label: string;
  view?: PermissionKey;
  create?: PermissionKey;
  update?: PermissionKey;
  delete?: PermissionKey;
  /** Para permisos que no son CRUD (hoy solo IA) — un único checkbox con label propio. */
  single?: { key: PermissionKey; label: string };
}

/**
 * Mismo catálogo que el backend (domain/user/Permission.java) — agrupado por módulo para
 * la UI. Única fuente para el editor de overrides de /users y el editor de roles de /roles,
 * no duplicar esta lista en otro lado.
 */
export const PERMISSION_MODULES: PermissionModule[] = [
  { label: 'Insumos',     view: 'PRODUCTS_VIEW',      create: 'PRODUCTS_CREATE',      update: 'PRODUCTS_UPDATE',      delete: 'PRODUCTS_DELETE' },
  { label: 'Categorías',  view: 'CATEGORIES_VIEW',    create: 'CATEGORIES_CREATE',    update: 'CATEGORIES_UPDATE',    delete: 'CATEGORIES_DELETE' },
  { label: 'Proveedores', view: 'SUPPLIERS_VIEW',     create: 'SUPPLIERS_CREATE',     update: 'SUPPLIERS_UPDATE',     delete: 'SUPPLIERS_DELETE' },
  { label: 'Compras',     view: 'PURCHASES_VIEW',     create: 'PURCHASES_CREATE',     update: 'PURCHASES_UPDATE',     delete: 'PURCHASES_DELETE' },
  { label: 'Ventas',      view: 'SALES_VIEW',         create: 'SALES_CREATE',         delete: 'SALES_DELETE' },
  { label: 'Merma',       view: 'WASTE_VIEW',         create: 'WASTE_CREATE' },
  { label: 'Stock',       view: 'STOCK_VIEW',         delete: 'STOCK_DELETE' },
  { label: 'Conteos',     view: 'STOCK_COUNTS_VIEW',  create: 'STOCK_COUNTS_CREATE' },
  { label: 'Menú',        view: 'MENU_VIEW',          create: 'MENU_CREATE',          update: 'MENU_UPDATE',          delete: 'MENU_DELETE' },
  { label: 'Food Cost',   view: 'FOOD_COST_VIEW' },
  { label: 'Alertas',     view: 'ALERTS_VIEW',        update: 'ALERTS_UPDATE' },
  { label: 'Usuarios',    view: 'USERS_VIEW',         create: 'USERS_CREATE',         update: 'USERS_UPDATE',         delete: 'USERS_DELETE' },
  { label: 'Auditoría',   view: 'AUDIT_VIEW' },
  { label: 'Roles',       view: 'ROLES_VIEW',         create: 'ROLES_CREATE',         update: 'ROLES_UPDATE',         delete: 'ROLES_DELETE' },
  { label: 'Entrada rápida (IA)', single: { key: 'AI_USE', label: 'Permitido' } },
];

export function allPermissionKeys(): PermissionKey[] {
  return PERMISSION_MODULES.flatMap(m =>
    [m.view, m.create, m.update, m.delete, m.single?.key].filter((p): p is PermissionKey => !!p));
}
