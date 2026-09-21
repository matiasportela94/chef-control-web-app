import { AfterViewInit, Component, ElementRef, Input, OnDestroy, computed, signal } from '@angular/core';

export interface StepPoint {
  at: string;
  value: number | null | undefined;
}

/**
 * Línea escalonada de una sola serie, en SVG inline.
 *
 * <p>Escalonada y no recta: un precio rige hasta el cambio siguiente, así que una diagonal
 * entre dos puntos dibujaría precios intermedios que nunca existieron.
 *
 * <p>Una serie por gráfico a propósito. Precio y food cost tienen escalas distintas y meterlos
 * en un mismo plot con dos ejes Y inventa una correlación que no está en los datos — es el
 * error clásico de los dashboards. Dos gráficos apilados comparten el eje X y no mienten.
 *
 * <p>Sin librería: son ~40 líneas de path y no justifica una dependencia nueva.
 */
@Component({
  selector: 'app-step-line-chart',
  standalone: true,
  templateUrl: './step-line-chart.component.html',
  styleUrl: './step-line-chart.component.scss'
})
export class StepLineChartComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) set points(value: StepPoint[]) { this._points.set(value ?? []); }
  /** Nombra la serie: con una sola serie el título reemplaza a la leyenda. */
  @Input({ required: true }) title = '';
  @Input() color = 'var(--chart-1)';
  @Input() format: 'currency' | 'percent' = 'currency';
  @Input() emptyLabel = 'Sin datos en el período';

  private _points = signal<StepPoint[]>([]);

  // El viewBox se ata al ancho real del contenedor en vez de ser fijo. Con un viewBox fijo y
  // height:auto el alto crece con el ancho: 460px en una tarjeta de escritorio y 70px en un
  // teléfono, que es la misma relación de aspecto y ninguna de las dos sirve.
  // Se observa el elemento del componente y no el del plot: el plot vive adentro de un @if y
  // todavía no existe cuando corre ngAfterViewInit, así que el observer nunca se enganchaba y
  // el viewBox quedaba clavado en el ancho por defecto.
  private resizeObserver?: ResizeObserver;

  constructor(private host: ElementRef<HTMLElement>) {}

  private width = signal(720);
  get W(): number { return this.width(); }

  /** Alto fijo: incluye la banda del eje X, si no las fechas quedan fuera del recuadro. */
  readonly H = 240;

  ngAfterViewInit(): void {
    const host = this.host.nativeElement;
    if (!host || typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) this.width.set(Math.round(w));
    });
    this.resizeObserver.observe(host);
  }

  ngOnDestroy(): void { this.resizeObserver?.disconnect(); }
  readonly padL = 64;
  readonly padR = 16;
  readonly padT = 12;
  readonly padB = 34;

  hoverIndex = signal<number | null>(null);

  /** Los puntos con valor, que son los únicos que se pueden dibujar. */
  private plotted = computed(() =>
    this._points()
      .map((p, i) => ({ ...p, i, t: Date.parse(p.at) }))
      .filter(p => p.value != null && !Number.isNaN(p.t)));

  hasData = computed(() => this.plotted().length > 0);

  private bounds = computed(() => {
    const pts = this.plotted();
    const values = pts.map(p => p.value as number);
    const times = pts.map(p => p.t);
    const min = Math.min(...values);
    const max = Math.max(...values);
    // Una serie plana necesita alto igual: sin esto, max === min y la división explota.
    const pad = max === min ? (Math.abs(max) || 1) * 0.5 : (max - min) * 0.15;
    return {
      minT: Math.min(...times),
      maxT: Math.max(...times),
      minV: Math.max(0, min - pad),
      maxV: max + pad,
    };
  });

  x(t: number): number {
    const { minT, maxT } = this.bounds();
    if (maxT === minT) return this.padL + (this.W - this.padL - this.padR) / 2;
    return this.padL + ((t - minT) / (maxT - minT)) * (this.W - this.padL - this.padR);
  }

  y(v: number): number {
    const { minV, maxV } = this.bounds();
    if (maxV === minV) return this.padT + (this.H - this.padT - this.padB) / 2;
    return this.H - this.padB - ((v - minV) / (maxV - minV)) * (this.H - this.padT - this.padB);
  }

  /** M x0,y0 H x1 V y1 H x2 V y2 … — el valor se sostiene hasta el cambio siguiente. */
  path = computed(() => {
    const pts = this.plotted();
    if (!pts.length) return '';
    let d = `M ${this.x(pts[0].t)},${this.y(pts[0].value as number)}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` H ${this.x(pts[i].t)} V ${this.y(pts[i].value as number)}`;
    }
    return d;
  });

  markers = computed(() => this.plotted().map(p => ({
    cx: this.x(p.t),
    cy: this.y(p.value as number),
    index: p.i,
    at: p.at,
    value: p.value as number,
  })));

  /** Cuatro líneas de referencia: suficientes para leer la escala, pocas para no hacer ruido. */
  gridLines = computed(() => {
    if (!this.hasData()) return [];
    const { minV, maxV } = this.bounds();
    return [0, 1, 2, 3].map(i => {
      const v = minV + ((maxV - minV) * i) / 3;
      return { y: this.y(v), label: this.formatValue(v) };
    });
  });

  /** Solo los extremos en el eje X: con más, las fechas se pisan en pantalla angosta. */
  xLabels = computed(() => {
    const pts = this.plotted();
    if (!pts.length) return [];
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first.i === last.i) return [{ x: this.x(first.t), label: this.formatDate(first.at) }];
    return [
      { x: this.x(first.t), label: this.formatDate(first.at) },
      { x: this.x(last.t),  label: this.formatDate(last.at) },
    ];
  });

  hovered = computed(() => {
    const index = this.hoverIndex();
    if (index == null) return null;
    return this.markers().find(m => m.index === index) ?? null;
  });

  /** El punto más cercano al cursor: obliga a menos puntería que apuntarle al marcador. */
  onMove(event: MouseEvent): void {
    const target = event.currentTarget as SVGSVGElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * this.W;
    const nearest = this.markers().reduce<{ index: number; d: number } | null>((best, m) => {
      const d = Math.abs(m.cx - x);
      return !best || d < best.d ? { index: m.index, d } : best;
    }, null);
    this.hoverIndex.set(nearest?.index ?? null);
  }

  clearHover(): void { this.hoverIndex.set(null); }

  formatValue(v: number | null | undefined): string {
    if (v == null) return '—';
    return this.format === 'percent'
      ? `${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
      : v.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  }
}
