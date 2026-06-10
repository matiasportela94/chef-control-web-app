import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AlertNotificationService } from '../../core/services/alert-notification.service';
import { AiInputComponent } from '../../shared/components/ai-input/ai-input.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AiInputComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent implements OnInit {
  aiInputOpen = signal(false);

  constructor(
    public authService: AuthService,
    public alertNotification: AlertNotificationService,
    private router: Router,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.alertNotification.refresh();
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
