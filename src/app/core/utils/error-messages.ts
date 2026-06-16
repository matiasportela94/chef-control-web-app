import es from '../../../assets/i18n/es.json';

export function getErrorMessage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return (es.errors as Record<string, string>)[code];
}
