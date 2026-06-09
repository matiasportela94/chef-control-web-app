export function formatARS(n?: number | null): string {
  if (n == null) return '—';
  return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(s?: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
  return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export function formatPct(n?: number | null): string {
  if (n == null) return '—';
  return n.toFixed(1) + '%';
}
