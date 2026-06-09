export function extractApiError(e: unknown, fallback: string): string {
  return (e as any)?.error?.message ?? fallback;
}
