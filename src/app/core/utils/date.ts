export function todayISO(): string {
  return new Date().toISOString().substring(0, 10);
}

/** Converts a YYYY-MM-DD date string to a UTC instant string accepted by the backend. */
export function dateToInstant(dateStr: string): string {
  return dateStr ? `${dateStr}T00:00:00.000Z` : '';
}

export function firstOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().substring(0, 10);
}

export function thisMonth(): { from: string; to: string } {
  const d = new Date();
  return { from: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().substring(0, 10), to: todayISO() };
}

export function lastMonth(): { from: string; to: string } {
  const d = new Date();
  return {
    from: new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().substring(0, 10),
    to:   new Date(d.getFullYear(), d.getMonth(), 0).toISOString().substring(0, 10),
  };
}

export function lastNDays(n: number): { from: string; to: string } {
  const to = new Date(), from = new Date();
  from.setDate(to.getDate() - n + 1);
  return { from: from.toISOString().substring(0, 10), to: to.toISOString().substring(0, 10) };
}

// ── Días de Argentina ────────────────────────────────────────────────────────
// Lo de arriba usa el día UTC: "2026-11-01" se manda como 2026-11-01T00:00Z, que en Argentina es el 31/10 a las
// 21 h, y así se muestra y así cae en un reporte que corta por día argentino. Estos helpers usan el día de acá.
// ponytail: UTC−3 fijo (Argentina no tiene horario de verano desde 2009); si vuelve, pasar a Intl con la zona.
const AR_TZ = 'America/Argentina/Buenos_Aires';

/** Hoy en Argentina, "YYYY-MM-DD" (todayISO() da el día UTC: después de las 21 h ya es mañana). */
export function arToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: AR_TZ });
}

/** El día argentino de un instante, "YYYY-MM-DD". */
export function arDateOf(instant: string): string {
  return new Date(instant).toLocaleDateString('sv-SE', { timeZone: AR_TZ });
}

/** Primer y último instante de un día argentino, para mandar al back (from/to inclusivos). */
export function arDayStart(date: string): string {
  return new Date(`${date}T00:00:00-03:00`).toISOString();
}
export function arDayEnd(date: string): string {
  return new Date(`${date}T23:59:59.999-03:00`).toISOString();
}
