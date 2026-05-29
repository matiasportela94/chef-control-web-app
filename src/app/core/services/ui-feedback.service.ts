import { Injectable, signal } from '@angular/core';

export type UiFeedbackStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UiFeedbackState {
  status: UiFeedbackStatus;
  title: string;
  message: string;
  details?: string;
  retryLabel?: string;
  onRetry?: (() => void) | null;
  onClose?: (() => void) | null;
}

@Injectable({ providedIn: 'root' })
export class UiFeedbackService {
  private readonly initialState: UiFeedbackState = {
    status: 'idle',
    title: '',
    message: '',
    retryLabel: undefined,
    onRetry: null,
    onClose: null
  };

  readonly state = signal<UiFeedbackState>(this.initialState);

  showLoading(title: string, message: string): void {
    this.state.set({ status: 'loading', title, message, onClose: null });
  }

  showSuccess(title: string, message: string, details?: string, onClose?: (() => void) | null): void {
    this.state.set({ status: 'success', title, message, details, retryLabel: undefined, onRetry: null, onClose: onClose ?? null });
  }

  showError(title: string, message: string, details?: string, retry?: (() => void) | null, retryLabel = 'Reintentar', onClose?: (() => void) | null): void {
    this.state.set({ status: 'error', title, message, details, retryLabel: retry ? retryLabel : undefined, onRetry: retry ?? null, onClose: onClose ?? null });
  }

  reset(): void {
    this.state.set(this.initialState);
  }
}
