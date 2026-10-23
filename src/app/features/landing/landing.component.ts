import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { SubscriptionPlanResponse } from '../../api/models/subscription-plan-response';
import { BillingPeriod, UPCOMING_FEATURES, annualSavingPct, planPrice } from '../../core/utils/plans';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly i18n = inject(I18nService);
  private readonly route = inject(ActivatedRoute);

  readonly today = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date());

  readonly plans  = signal<SubscriptionPlanResponse[]>([]);
  readonly period = signal<BillingPeriod>('MONTHLY');
  readonly annualSavingPct = computed(() => annualSavingPct(this.plans()));

  /**
   * fetch y no el cliente generado: si el backend está caído o deployando, la cadena de interceptores
   * mandaría la landing a /maintenance. Sin precios la sección simplemente no se muestra.
   */
  async ngOnInit(): Promise<void> {
    try {
      const res = await fetch(`${environment.apiUrl}/subscription/plans`);
      if (res.ok) this.plans.set(await res.json());
    } catch { /* sin precios no hay sección */ }
    // "Cambiar plan" desde el registro vuelve a /#planes; la sección recién existe ahora, después del fetch.
    if (this.plans().length && this.route.snapshot.fragment === 'planes') {
      setTimeout(() => document.getElementById('planes')?.scrollIntoView());
    }
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  tierName(tier?: string): string {
    return this.t('landing.pricing.tiers.' + tier);
  }

  price(n?: number): string {
    return planPrice(n);
  }

  /** Las cards listan solo lo que cada plan suma sobre el anterior: los planes son acumulativos. */
  addedFeatures(index: number): string[] {
    const prev = new Set(index > 0 ? this.plans()[index - 1].features ?? [] : []);
    return (this.plans()[index].features ?? []).filter(f => !prev.has(f));
  }

  featureLabel(key: string): string {
    const label = this.t('plan.features.' + key);
    return label.startsWith('plan.') ? key : label;
  }

  isUpcoming(key: string): boolean {
    return UPCOMING_FEATURES.has(key);
  }

  /** El plan elegido viaja al registro, que crea la cuenta y manda al checkout. El gratis es registro a secas. */
  registerParams(p: SubscriptionPlanResponse): Record<string, string> {
    return p.monthlyAmountArs == null
      ? { view: 'register' }
      : { view: 'register', plan: p.planTier!, period: this.period() };
  }
}
