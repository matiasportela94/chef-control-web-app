export function todayISO(): string {
  return new Date().toISOString().substring(0, 10);
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
// Lo de arriba usa el día UTC. Para guardar la fecha de un registro (compra, venta) y para cortar un reporte por día,
// estos: "2026-11-01" a las 00:00 UTC es el 31/10 a las 21 h en Argentina, y así se mostraba y se contaba.
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
