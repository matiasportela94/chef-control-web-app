import { Component, HostListener, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { AlertNotificationService } from '../../core/services/alert-notification.service';
import { AiRefreshService } from '../../core/services/ai-refresh.service';
import { ThemeService } from '../../core/services/theme.service';
import { I18nService } from '../../core/services/i18n.service';
import { AiInputComponent } from '../../shared/components/ai-input/ai-input.component';
import { groupByAccount } from '../../core/utils/restaurants';
import { extractApiError } from '../../core/utils/api-error';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AiInputComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent implements OnInit, OnDestroy {
  aiInputOpen = signal(false);
  sidebarOpen = signal(false);

  // ---- selector de locales: con 2 o más, el nombre del local (o el ícono, en el teléfono) abre el menú
  storeMenuOpen = signal(false);
  /** Dónde arranca el menú en escritorio (debajo del nombre). En el teléfono va a lo ancho, por CSS. */
  storeMenuLeft = signal(0);
  switching = signal<string | null>(null);
  switchError = signal<string | null>(null);
  readonly restaurantGroups = computed(() => groupByAccount(this.authService.currentUser()?.restaurants ?? []));
  readonly manyRestaurants = computed(() => (this.authService.currentUser()?.restaurants.length ?? 0) > 1);

  private static readonly COLLAPSED_SECTIONS_KEY = 'sidebar-collapsed-sections';
  collapsedSections = signal<Set<string>>(this.loadCollapsedSections());

  private aiSub?: Subscription;

  constructor(
    public authService: AuthService,
    public alertNotification: AlertNotificationService,
    public theme: ThemeService,
    private aiRefresh: AiRefreshService,
    private router: Router,
    private i18n: I18nService,
  ) {}

  t(key: string): string {
    return this.i18n.t(key);
  }

  async ngOnInit(): Promise<void> {
    await this.alertNotification.refresh();
    this.aiSub = this.aiRefresh.executed$.subscribe(() => {
      void this.alertNotification.refresh();
    });
  }

  ngOnDestroy(): void {
    this.aiSub?.unsubscribe();
  }

  toggleStoreMenu(event: Event): void {
    this.storeMenuLeft.set((event.currentTarget as HTMLElement).getBoundingClientRect().left);
    this.switchError.set(null);
    this.storeMenuOpen.update(open => !open);
  }

  @HostListener('document:keydown.escape')
  closeStoreMenu(): void {
    if (this.switching() === null) this.storeMenuOpen.set(false);
  }

  /**
   * Cambiar de local recarga la app entera (location.assign), no navega: el shell no se recrea con el router y
   * quedarían cachés del local anterior (el historial del chat ofrecería deshacer cosas de otro local, el badge de
   * alertas, las pantallas abiertas). La sesión y la cookie sobreviven a la recarga.
   */
  async switchRestaurant(id: string | undefined): Promise<void> {
    const user = this.authService.currentUser();
    if (!id || this.switching() !== null) return;
    if (id === user?.restaurantId) { this.storeMenuOpen.set(false); return; }
    this.switching.set(id);
    this.switchError.set(null);
    try {
      await this.authService.switchToRestaurant(id);
      location.assign('/dashboard');
    } catch (e) {
      this.switchError.set(extractApiError(e, this.t('nav.switchError')));
      this.switching.set(null);
    }
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  isSectionCollapsed(key: string): boolean {
    return this.collapsedSections().has(key);
  }

  toggleSection(key: string, event: Event): void {
    // ponytail: no dejar que el toggle burbujee al (click) del <nav> que cierra el
    // drawer mobile — si no, en el celular tocar el título cierra todo el sidebar.
    event.stopPropagation();
    const next = new Set(this.collapsedSections());
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.collapsedSections.set(next);
    try {
      localStorage.setItem(ShellComponent.COLLAPSED_SECTIONS_KEY, JSON.stringify([...next]));
    } catch {
      // localStorage puede fallar (privado, cuota) — el toggle sigue andando en memoria
    }
  }

  private loadCollapsedSections(): Set<string> {
    try {
      const raw = localStorage.getItem(ShellComponent.COLLAPSED_SECTIONS_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }
}
