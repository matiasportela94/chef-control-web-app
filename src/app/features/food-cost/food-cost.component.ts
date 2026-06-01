import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../api/api';
import { calculate } from '../../api/fn/food-cost-controller/calculate';
import { FoodCostResponse } from '../../api/models/food-cost-response';
import { parseBlob } from '../../core/utils/parse-blob';

interface Preset { label: string; from: string; to: string; }

@Component({
  selector: 'app-food-cost',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './food-cost.component.html',
  styleUrl: './food-cost.component.scss'
})
export class FoodCostComponent {
  from = signal(this.firstOfMonth());
  to   = signal(this.todayISO());

  loading = signal(false);
  error   = signal<string | null>(null);
  result  = signal<FoodCostResponse | null>(null);

  readonly presets: Preset[] = [
    { label: 'Este mes',      ...this.thisMonth()     },
    { label: 'Mes anterior',  ...this.lastMonth()     },
    { label: 'Últimos 7 días',...this.lastNDays(7)    },
    { label: 'Últimos 30 días',...this.lastNDays(30)  },
  ];

  readonly Math = Math;

  constructor(private api: Api) {}

  applyPreset(p: Preset): void {
    this.from.set(p.from);
    this.to.set(p.to);
    this.result.set(null);
  }

  async calculate(): Promise<void> {
    if (!this.from() || !this.to()) return;
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);
    try {
      const raw = await this.api.invoke(calculate, {
        from: this.from() + 'T00:00:00Z',
        to:   this.to()   + 'T23:59:59Z',
      }) as unknown;
      this.result.set(await parseBlob<FoodCostResponse>(raw));
    } catch {
      this.error.set('No se pudo calcular el food cost. Verificá el rango de fechas.');
    } finally {
      this.loading.set(false);
    }
  }

  foodCostStatus(): 'great' | 'ok' | 'high' | 'danger' {
    const pct = this.result()?.foodCostPercentage;
    if (pct == null) return 'ok';
    if (pct < 28)  return 'great';
    if (pct < 35)  return 'ok';
    if (pct < 40)  return 'high';
    return 'danger';
  }

  formatARS(n?: number): string {
    if (n == null) return '—';
    return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatPct(n?: number): string {
    if (n == null) return '—';
    return n.toFixed(1) + '%';
  }

  formatDate(s?: string): string {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private todayISO(): string {
    return new Date().toISOString().substring(0, 10);
  }

  private firstOfMonth(): string {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().substring(0, 10);
  }

  private thisMonth(): { from: string; to: string } {
    const d = new Date();
    const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().substring(0, 10);
    return { from, to: this.todayISO() };
  }

  private lastMonth(): { from: string; to: string } {
    const d = new Date();
    const from = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().substring(0, 10);
    const to   = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().substring(0, 10);
    return { from, to };
  }

  private lastNDays(n: number): { from: string; to: string } {
    const to   = new Date();
    const from = new Date();
    from.setDate(to.getDate() - n + 1);
    return {
      from: from.toISOString().substring(0, 10),
      to:   to.toISOString().substring(0, 10),
    };
  }
}
