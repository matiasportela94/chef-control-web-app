import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from './shared/components/toast/toast.component';
import { UiFeedbackComponent } from './shared/components/ui-feedback/ui-feedback.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent, UiFeedbackComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {}
