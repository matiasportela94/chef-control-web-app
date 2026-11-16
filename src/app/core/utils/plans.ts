import { Api } from '../../api/api';
import { createSubscription } from '../../api/fn/subscription-controller/create-subscription';
import { requestSubscriptionChange } from '../../api/fn/subscription-controller/request-subscription-change';
import { CheckoutResponse } from '../../api/models/checkout-response';
import { SubscriptionChangeResponse } from '../../api/models/subscription-change-response';
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
 * Marca que esta pestaña se fue al checkout de Mercado Pago, y a qué. Al volver, el backend todavía no se
 * enteró (espera el aviso de MP): con la marca, /plan muestra "confirmando" y consulta un rato.
 * - '1': contratar. Se espera que la suscripción deje de estar PENDING.
 * - 'upgrade:PRO': pagar una suba de plan. Se espera que la suscripción ya sea de ese plan.
 * - 'change:PRO:ANNUAL': autorizar una solicitud de cambio de período. Se espera que la solicitud esté y ya no
 *   espere autorización (el plan y el período van en la marca porque ya podía haber otra solicitud antes).
 * Se usa una marca propia y no los parámetros que MP agrega al volver porque esos no están verificados.
 * sessionStorage puede no estar (modo privado estricto): sin marca solo se pierde el "confirmando".
 */
const CHECKOUT_KEY = 'cc_checkout_started';
export type CheckoutMark =
  | { kind: 'subscribe' }
  | { kind: 'upgrade'; planTier: PlanTier }
  | { kind: 'change'; planTier: PlanTier; billingPeriod: BillingPeriod };

export function checkoutMark(): CheckoutMark | null {
  let value: string | null = null;
  try { value = sessionStorage.getItem(CHECKOUT_KEY); } catch { }
  if (value === '1') return { kind: 'subscribe' };
  const upgrade = value?.match(/^upgrade:(\w+)$/);
  if (upgrade) return { kind: 'upgrade', planTier: upgrade[1] as PlanTier };
  const change = value?.match(/^change:(\w+):(MONTHLY|ANNUAL)$/);
  return change ? { kind: 'change', planTier: change[1] as PlanTier, billingPeriod: change[2] as BillingPeriod } : null;
}
export function clearCheckoutMark(): void { try { sessionStorage.removeItem(CHECKOUT_KEY); } catch { } }

function redirectToCheckout(checkoutUrl: string, mark: string): void {
  try { sessionStorage.setItem(CHECKOUT_KEY, mark); } catch { }
  window.location.href = checkoutUrl;
}

/** Crea la suscripción y manda el navegador al checkout de Mercado Pago. Si sale bien, no vuelve. */
export async function goToCheckout(api: Api, planTier: PlanTier, billingPeriod: BillingPeriod): Promise<void> {
  const raw = await api.invoke(createSubscription, { body: { planTier, billingPeriod } });
  redirectToCheckout((await parseBlob<CheckoutResponse>(raw)).checkoutUrl!, '1');
}

/**
 * Cambio de plan con una suscripción ACTIVE. Qué es lo decide el back (`changeType`):
 * - UPGRADE: inmediato. checkoutUrl es el pago único de la diferencia proporcional.
 * - PERIOD_CHANGE / DOWNGRADE_AND_PERIOD_CHANGE: rige al fin del período. checkoutUrl es la suscripción nueva,
 *   que hay que autorizar en MP (MP no deja cambiarle la frecuencia a una existente).
 * - DOWNGRADE: rige al fin del período, sin checkout.
 * Con checkoutUrl el navegador se va a Mercado Pago y el caller no tiene que hacer nada más.
 */
export async function requestPlanChange(api: Api, planTier: PlanTier, billingPeriod: BillingPeriod):
    Promise<SubscriptionChangeResponse> {
  const raw = await api.invoke(requestSubscriptionChange, { body: { planTier, billingPeriod } });
  const res = await parseBlob<SubscriptionChangeResponse>(raw);
  if (res.checkoutUrl) {
    redirectToCheckout(res.checkoutUrl,
      res.changeType === 'UPGRADE' ? `upgrade:${planTier}` : `change:${planTier}:${billingPeriod}`);
  }
  return res;
}
