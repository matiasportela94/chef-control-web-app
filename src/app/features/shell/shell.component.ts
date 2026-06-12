import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { AlertNotificationService } from '../../core/services/alert-notification.service';
import { AiRefreshService } from '../../core/services/ai-refresh.service';
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

  private aiSub?: Subscription;

  constructor(
    public authService: AuthService,
    public alertNotification: AlertNotificationService,
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
}
