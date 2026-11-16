import { formatIvaRate, ivaForLine } from './iva';

describe('ivaForLine', () => {
  // Casos devueltos por el backend real (2026-11-16): neto e IVA por línea.
  it('precio con IVA: neto = monto / (1 + r), IVA = monto − neto', () => {
    expect(ivaForLine(5.245, 811, 27, true)).toEqual({ net: 3349.37, iva: 904.33 });
    expect(ivaForLine(5.265, 3509.15, 2.5, true)).toEqual({ net: 18025.04, iva: 450.63 });
    expect(ivaForLine(11.361, 3182.7, 21, true)).toEqual({ net: 29883.18, iva: 6275.47 });
    expect(ivaForLine(1.5, 100.01, 10.5, true)).toEqual({ net: 135.76, iva: 14.26 });
    expect(ivaForLine(3, 333.33, 21, true)).toEqual({ net: 826.44, iva: 173.55 });
  });

  it('precio sin IVA: neto = monto, IVA = neto × r', () => {
    expect(ivaForLine(0.714, 666.07, 10.5, false)).toEqual({ net: 475.57, iva: 49.93 });
    expect(ivaForLine(14.743, 491.31, 10.5, false)).toEqual({ net: 7243.38, iva: 760.55 });
  });

  it('alícuota 0: todo es neto', () => {
    expect(ivaForLine(2, 150.5, 0, true)).toEqual({ net: 301, iva: 0 });
    expect(ivaForLine(2, 150.5, 0, false)).toEqual({ net: 301, iva: 0 });
  });
});

describe('formatIvaRate', () => {
  it('usa coma decimal', () => {
    expect(formatIvaRate(10.5)).toBe('10,5\u00A0%');
    expect(formatIvaRate(21)).toBe('21\u00A0%');
  });
});
