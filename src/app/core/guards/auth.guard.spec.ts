import { safeReturnUrl } from './auth.guard';

describe('safeReturnUrl', () => {
  it('deja pasar rutas internas, con query', () => {
    expect(safeReturnUrl('/plan')).toBe('/plan');
    expect(safeReturnUrl('/sales?from=2026-11-01')).toBe('/sales?from=2026-11-01');
  });

  it('manda al panel lo que no es una ruta interna', () => {
    for (const bad of [null, '', 'plan', '//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '/login', '/login?view=register']) {
      expect(safeReturnUrl(bad)).withContext(String(bad)).toBe('/dashboard');
    }
  });
});
