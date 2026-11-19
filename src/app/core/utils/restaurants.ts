export interface AccountGroup<T> { accountId: string; accountName: string; restaurants: T[]; }

/**
 * Los locales agrupados por cuenta, en el orden en que llegan. Con la invitación entre cuentas una persona puede
 * tener locales de dos cuentas: el selector de la barra y la lista del login muestran un encabezado por cuenta, pero
 * solo si hay más de una (con una sola, el encabezado no dice nada).
 */
export function groupByAccount<T extends { accountId?: string; accountName?: string }>(list: T[]): AccountGroup<T>[] {
  const groups = new Map<string, AccountGroup<T>>();
  for (const r of list) {
    const key = r.accountId ?? '';
    if (!groups.has(key)) groups.set(key, { accountId: key, accountName: r.accountName ?? '', restaurants: [] });
    groups.get(key)!.restaurants.push(r);
  }
  return [...groups.values()];
}
