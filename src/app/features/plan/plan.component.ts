import { Component, OnInit, signal } from '@angular/core';
import { Api } from '../../api/api';
import { get4 as getAccount } from '../../api/fn/account-controller/get-4';
import { AccountResponse } from '../../api/models/account-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { SpinnerComponent } from '../../shared/components/spinner/spinner.component';

/** Etiquetas de Feature (domain/plan/Feature.java) — las que no estén acá se muestran crudas. */
const FEATURE_LABELS: Record<string, string> = {
  STOCK_MOVEMENTS:       'Movimientos de stock',
  PRODUCT_CATALOG:       'Catálogo de insumos',
  BASIC_REPORTS:         'Reportes básicos',
  WHATSAPP_INTEGRATION:  'Integración WhatsApp',
  AI_INTERPRETER:        'Entrada rápida con IA',
  MULTI_USER:            'Múltiples usuarios',
  RECIPES_AND_FOOD_COST: 'Recetas y food cost',
  ADVANCED_REPORTS:      'Reportes avanzados',
  CUSTOM_ALERTS:         'Alertas personalizadas',
  MULTI_RESTAURANT:      'Múltiples restaurantes',
  POS_INTEGRATION:       'Integración POS',
  API_ACCESS:            'Acceso a la API',
  PRIORITY_SUPPORT:      'Soporte prioritario',
};

@Component({
  selector: 'app-plan',
  standalone: true,
  imports: [SpinnerComponent],
  templateUrl: './plan.component.html',
  styleUrl: './plan.component.scss'
})
export class PlanComponent implements OnInit {
  account = signal<AccountResponse | null>(null);
  loading = signal(true);
  error   = signal<string | null>(null);

  constructor(private api: Api) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    if (!this.account()) this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.invoke(getAccount) as unknown;
      this.account.set(await parseBlob<AccountResponse>(raw));
    } catch {
      this.error.set('No se pudo cargar la información de la cuenta.');
    } finally {
      this.loading.set(false);
    }
  }

  featureLabel(key: string): string {
    return FEATURE_LABELS[key] ?? key;
  }

  get restaurantUsage(): string {
    const a = this.account();
    if (!a) return '';
    const used = a.restaurantCount ?? 0;
    return a.restaurantLimit == null ? `${used} (sin límite)` : `${used} de ${a.restaurantLimit}`;
  }

  formatDate(iso?: string): string {
    return iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
  }
}
