import { Component, OnInit, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../../api/api';
import { getAccount } from '../../api/fn/account-controller/get-account';
import { deleteAccount } from '../../api/fn/account-controller/delete-account';
import { AccountResponse } from '../../api/models/account-response';
import { parseBlob } from '../../core/utils/parse-blob';
import { extractApiError } from '../../core/utils/api-error';
import { AuthService } from '../../core/services/auth.service';
import { ActionDialogComponent } from '../../shared/components/action-dialog/action-dialog.component';
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
  imports: [SpinnerComponent, ActionDialogComponent],
  templateUrl: './plan.component.html',
  styleUrl: './plan.component.scss'
})
export class PlanComponent implements OnInit {
  account = signal<AccountResponse | null>(null);
  loading = signal(true);
  error   = signal<string | null>(null);

  deleting      = signal(false);
  deleteConfirm = signal('');
  deleteLoading = signal(false);
  deleteError   = signal<string | null>(null);

  deleteBlocked = computed(() =>
    this.deleteLoading() || this.deleteConfirm().trim() !== (this.account()?.name ?? ''));

  /**
   * Solo el dueño puede cerrar la cuenta — y el backend lo vuelve a exigir, esto es únicamente
   * para no mostrar un botón que va a rebotar. Se compara por email porque el nombre del rol
   * es texto libre de cada cuenta y no sirve para identificar al dueño.
   */
  isOwner = computed(() =>
    !!this.account()?.ownerEmail && this.account()!.ownerEmail === this.auth.currentUser()?.email);

  constructor(private api: Api, private auth: AuthService, private router: Router) {}

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

  openDelete(): void {
    this.deleting.set(true);
    this.deleteConfirm.set('');
    this.deleteError.set(null);
  }

  closeDelete(): void {
    this.deleting.set(false);
    this.deleteConfirm.set('');
  }

  async confirmDelete(): Promise<void> {
    if (this.deleteBlocked()) return;
    this.deleteLoading.set(true);
    this.deleteError.set(null);
    try {
      await this.api.invoke(deleteAccount);
      await this.auth.logout();
      await this.router.navigate(['/']);
    } catch (e: any) {
      this.deleteError.set(extractApiError(e, 'No se pudo eliminar la cuenta'));
    } finally {
      this.deleteLoading.set(false);
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
