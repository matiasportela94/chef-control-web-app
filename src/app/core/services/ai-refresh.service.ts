import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AiRefreshService {
  private readonly _executed$ = new Subject<void>();
  readonly executed$ = this._executed$.asObservable();

  notify(): void {
    this._executed$.next();
  }
}
