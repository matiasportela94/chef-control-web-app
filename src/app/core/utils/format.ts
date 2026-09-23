export function formatARS(n?: number | null): string {
  if (n == null) return '—';
  return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(s?: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Fecha sin hora, como la manda el backend (LocalDate, "2026-09-25"). No usar formatDate() para
 * esto: new Date("2026-09-25") se parsea como UTC y en Argentina (UTC-3) se muestra un dia antes.
 */
export function formatDateOnly(s?: string | null): string {
  if (!s) return '—';
  return new Date(s + 'T00:00:00').toLocaleDateString('es-AR',
    { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function formatDatetime(s?: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatNum(n?: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatPct(n?: number | null): string {
  if (n == null) return '—';
  // toFixed() escribe el decimal con punto siempre, sin mirar el locale: daba "34.2%".
  return n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}
