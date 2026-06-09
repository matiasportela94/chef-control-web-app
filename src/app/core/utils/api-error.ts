import { getErrorMessage } from './error-messages';

export function extractApiError(e: unknown, fallback: string): string {
  const err = (e as any)?.error;
  return getErrorMessage(err?.errorCode) ?? err?.message ?? fallback;
}
