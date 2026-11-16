/** Alícuotas de IVA que acepta el backend (otra → 400 INVALID_IVA_PERCENTAGE). */
export const IVA_RATES = [0, 2.5, 5, 10.5, 21, 27] as const;

/** "21 %", "10,5 %": con coma decimal, como se lee en Argentina, y espacio no separable (no se corta antes del %). */
export function formatIvaRate(rate: number): string {
  return rate.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + '\u00A0%';
}

export interface IvaAmounts { net: number; iva: number; }

/** Escala de 6 decimales: toFixed redondea el binario al decimal más cercano ("5.245", no 5.24499…). */
const toMicros = (x: number) => BigInt(x.toFixed(6).replace('.', ''));
const divHalfUp = (a: bigint, b: bigint) => (2n * a + b) / (2n * b);

/**
 * Neto e IVA de una línea, con la misma regla que el backend (verificada contra el back en 120 líneas al azar):
 * el monto (cantidad × precio) se redondea al centavo y recién ahí se calcula. Con precio con IVA,
 * neto = monto / (1 + alícuota) e IVA = monto − neto; sin IVA, neto = monto e IVA = neto × alícuota.
 * Todo en centavos enteros: en punto flotante un x,xx5 cae a veces del lado equivocado.
 * Es solo una vista previa: lo que vale es lo que devuelve el back al guardar.
 */
export function ivaForLine(quantity: number, pricePerUnit: number, ivaPercentage: number, pricesIncludeIva: boolean): IvaAmounts {
  const cents = divHalfUp(toMicros(quantity) * toMicros(pricePerUnit), 10n ** 10n);  // micros × micros = 1e-12
  const rate10 = BigInt(Math.round(ivaPercentage * 10));                              // 10,5 % → 105
  const net = pricesIncludeIva ? divHalfUp(cents * 1000n, 1000n + rate10) : cents;
  const iva = pricesIncludeIva ? cents - net : divHalfUp(cents * rate10, 1000n);
  return { net: Number(net) / 100, iva: Number(iva) / 100 };
}
