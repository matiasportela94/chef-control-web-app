import { arDateOf, arDayEnd, arDayStart, arToday } from './date';

describe('días argentinos', () => {
  it('arDayStart / arDayEnd: medianoche y último instante del día en UTC−3', () => {
    expect(arDayStart('2026-11-01')).toBe('2026-11-01T03:00:00.000Z');
    expect(arDayEnd('2026-11-30')).toBe('2026-12-01T02:59:59.999Z');
  });

  it('arDateOf: el día argentino de un instante', () => {
    expect(arDateOf('2026-11-01T02:59:59Z')).toBe('2026-10-31');  // 23:59 del 31/10 acá
    expect(arDateOf('2026-11-01T03:00:00Z')).toBe('2026-11-01');
    expect(arDateOf(arDayStart('2026-11-16'))).toBe('2026-11-16');  // ida y vuelta: lo que se guarda se ve igual
  });

  it('arToday: YYYY-MM-DD', () => {
    expect(arToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
