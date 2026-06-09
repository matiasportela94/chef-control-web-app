import { AfterViewInit, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-drawer',
  standalone: true,
  templateUrl: './drawer.component.html',
})
export class DrawerComponent implements AfterViewInit {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() subtitle = '';
  /** sm=max-w-md · md=max-w-lg (default) · lg=max-w-2xl · xl=max-w-3xl · 2xl=max-w-4xl */
  @Input() size: 'sm' | 'md' | 'lg' | 'xl' | '2xl' = 'md';
  @Output() closed = new EventEmitter<void>();

  protected ready = false;

  ngAfterViewInit(): void {
    setTimeout(() => { this.ready = true; });
  }

  close(): void { this.closed.emit(); }
}
