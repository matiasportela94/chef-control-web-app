import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent {
  readonly auth = inject(AuthService);
  readonly i18n = inject(I18nService);

  readonly today = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date());

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
