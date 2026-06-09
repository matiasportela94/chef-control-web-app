const ERROR_MESSAGES: Record<string, string> = {
  // Auth
  INVALID_CREDENTIALS:       'Credenciales incorrectas.',
  USER_NOT_FOUND:            'Usuario no encontrado.',
  USER_INACTIVE:             'El usuario está inactivo.',
  NO_ACTIVE_MEMBERSHIPS:     'No tenés restaurantes activos asociados a tu cuenta.',
  INVALID_TOKEN:             'El enlace no es válido.',
  TOKEN_EXPIRED:             'El enlace expiró. Solicitá uno nuevo.',
  TOKEN_ALREADY_USED:        'El enlace ya fue utilizado.',
  // Restaurant
  RESTAURANT_NOT_FOUND:      'Restaurante no encontrado.',
  RESTAURANT_ACCESS_DENIED:  'No tenés acceso a este restaurante.',
  RESTAURANT_INACTIVE:       'El restaurante está inactivo.',
  // Resources
  SUPPLIER_NOT_FOUND:        'Proveedor no encontrado.',
  PURCHASE_NOT_FOUND:        'Compra no encontrada.',
  PRODUCT_NOT_FOUND:         'Producto no encontrado.',
  UNIT_NOT_FOUND:            'Unidad no encontrada.',
  CATEGORY_NOT_FOUND:        'Categoría no encontrada.',
  MOVEMENT_NOT_FOUND:        'Movimiento no encontrado.',
  WASTE_EVENT_NOT_FOUND:     'Merma no encontrada.',
  RECIPE_NOT_FOUND:          'Receta no encontrada.',
  MENU_ITEM_NOT_FOUND:       'Plato no encontrado.',
  MENU_ITEM_INACTIVE:        'El plato está inactivo.',
  SALE_NOT_FOUND:            'Venta no encontrada.',
  STOCK_COUNT_NOT_FOUND:     'Conteo de stock no encontrado.',
  ALERT_NOT_FOUND:           'Alerta no encontrada.',
  // Stock movements
  MOVEMENT_ALREADY_REVERSED:   'El movimiento ya fue revertido.',
  MOVEMENT_CANNOT_BE_REVERSED: 'Este movimiento no se puede revertir.',
  // Business rules
  UNIT_CONVERSION_NOT_FOUND: 'No existe conversión entre esas unidades.',
  MISSING_PURCHASE_COST:     'Falta el costo de la compra.',
  INSUFFICIENT_STOCK:        'Stock insuficiente para completar la operación.',
  INVALID_EXPIRATION_DATE:   'Fecha de vencimiento inválida.',
  DUPLICATE_EMAIL:           'Ya existe un usuario con ese email.',
  DUPLICATE_PHONE:           'Ya existe un usuario con ese teléfono.',
  DUPLICATE_SLUG:            'Ya existe un elemento con ese identificador.',
  DUPLICATE_SKU:             'Ya existe un producto con ese código.',
  CATEGORY_HAS_PRODUCTS:     'No se puede eliminar la categoría porque tiene productos asociados.',
  SYSTEM_CATEGORY_IMMUTABLE: 'Las categorías del sistema no se pueden modificar.',
  // Generic
  INTERNAL_ERROR:            'Error interno del servidor. Intentá de nuevo.',
};

export function getErrorMessage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return ERROR_MESSAGES[code];
}
