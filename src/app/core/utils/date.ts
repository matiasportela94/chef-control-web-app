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
