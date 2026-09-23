import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { AlertNotificationService } from '../../core/services/alert-notification.service';
import { AiRefreshService } from '../../core/services/ai-refresh.service';
import { ThemeService } from '../../core/services/theme.service';
import { AiInputComponent } from '../../shared/components/ai-input/ai-input.component';

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

  private static readonly COLLAPSED_SECTIONS_KEY = 'sidebar-collapsed-sections';
  collapsedSections = signal<Set<string>>(this.loadCollapsedSections());

  private aiSub?: Subscription;

  constructor(
    public authService: AuthService,
    public alertNotification: AlertNotificationService,
    public theme: ThemeService,
    private aiRefresh: AiRefreshService,
    private router: Router,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.alertNotification.refresh();
    this.aiSub = this.aiRefresh.executed$.subscribe(() => {
      void this.alertNotification.refresh();
    });
  }

  ngOnDestroy(): void {
    this.aiSub?.unsubscribe();
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
