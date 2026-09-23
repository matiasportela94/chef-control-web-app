import { Injectable, signal } from '@angular/core';

type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'cc-theme';

  isDark = signal(false);

  constructor() {
    const saved = localStorage.getItem(this.STORAGE_KEY) as Theme | null;
    const preferred: Theme = saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    this.apply(preferred);
  }

  toggle(): void {
    this.apply(this.isDark() ? 'light' : 'dark');
  }

  private apply(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
    this.isDark.set(theme === 'dark');
    localStorage.setItem(this.STORAGE_KEY, theme);
  }
}
