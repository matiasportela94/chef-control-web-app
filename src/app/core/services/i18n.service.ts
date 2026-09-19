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

  t(key: string): string {
    const parts = key.split('.');
    let node: any = TRANSLATIONS[this.locale()];
    for (const part of parts) {
      node = node?.[part];
    }
    return typeof node === 'string' ? node : key;
  }
}
