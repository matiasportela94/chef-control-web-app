import { Injectable, signal } from '@angular/core';
import es from '../../../assets/i18n/es.json';
import en from '../../../assets/i18n/en.json';

export type Locale = 'es' | 'en';

type Translations = typeof es;

const TRANSLATIONS: Record<Locale, Translations> = { es, en };

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly locale = signal<Locale>('es');

  setLocale(locale: Locale): void {
    this.locale.set(locale);
  }

  /**
   * Traduce una clave. Los `{placeholder}` del texto se reemplazan con `params`:
   * `t('products.yieldPreview', { net: 1, unit: 'kg' })`.
   */
  /** Una lista de textos (un array en el JSON); vacía si la clave no es una lista. */
  list(key: string): string[] {
    let node: any = TRANSLATIONS[this.locale()];
    for (const part of key.split('.')) node = node?.[part];
    return Array.isArray(node) ? node : [];
  }

  t(key: string, params?: Record<string, string | number>): string {
    const parts = key.split('.');
    let node: any = TRANSLATIONS[this.locale()];
    for (const part of parts) {
      node = node?.[part];
    }
    if (typeof node !== 'string') return key;
    if (!params) return node;
    return node.replace(/\{(\w+)\}/g, (match, name) =>
      params[name] !== undefined ? String(params[name]) : match);
  }
}
