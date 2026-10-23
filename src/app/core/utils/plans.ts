import { Api } from '../../api/api';
import { createSubscription } from '../../api/fn/subscription-controller/create-subscription';
import { CheckoutResponse } from '../../api/models/checkout-response';
import { SubscriptionPlanResponse } from '../../api/models/subscription-plan-response';
import { parseBlob } from './parse-blob';

export type PlanTier = NonNullable<SubscriptionPlanResponse['planTier']>;
export type BillingPeriod = 'MONTHLY' | 'ANNUAL';

/**
 * Features del catálogo que todavía no existen en el producto. Se muestran igual, marcadas como
 * "Próximamente": publicarlas como incluidas sería prometer algo que no hay. Al construir una, sacarla de acá.
 */
export const UPCOMING_FEATURES: ReadonlySet<string> = new Set([
  'WHATSAPP_INTEGRATION', 'POS_INTEGRATION', 'API_ACCESS', 'CUSTOM_ALERTS',
]);

/** $170.000: los precios de los planes son pesos enteros. */
export function planPrice(n?: number | null): string {
  return n == null ? '—' : '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

/** El descuento anual sale de los precios que manda el backend, no de un 15 escrito en el front. */
export function annualSavingPct(plans: SubscriptionPlanResponse[]): number {
  const p = plans.find(x => x.monthlyAmountArs && x.annualAmountArs);
  return p ? Math.round((1 - p.annualAmountArs! / (p.monthlyAmountArs! * 12)) * 100) : 0;
}

/**
 * Marca que esta pestaña se fue al checkout de Mercado Pago. Al volver, la suscripción sigue PENDING
 * hasta que llega el aviso de MP al backend: con la marca, /plan muestra "confirmando" y consulta un rato.
 * Se usa una marca propia y no los parámetros que MP agrega al volver porque esos no están verificados.
 * sessionStorage puede no estar (modo privado estricto): sin marca solo se pierde el "confirmando".
 */
const CHECKOUT_KEY = 'cc_checkout_started';
export function checkoutStarted(): boolean { try { return sessionStorage.getItem(CHECKOUT_KEY) === '1'; } catch { return false; } }
export function clearCheckoutMark(): void { try { sessionStorage.removeItem(CHECKOUT_KEY); } catch { } }

/** Crea la suscripción y manda el navegador al checkout de Mercado Pago. Si sale bien, no vuelve. */
export async function goToCheckout(api: Api, planTier: PlanTier, billingPeriod: BillingPeriod): Promise<void> {
  const raw = await api.invoke(createSubscription, { body: { planTier, billingPeriod } });
  const checkout = await parseBlob<CheckoutResponse>(raw);
  try { sessionStorage.setItem(CHECKOUT_KEY, '1'); } catch { }
  window.location.href = checkout.checkoutUrl!;
}
