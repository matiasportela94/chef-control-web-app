export async function parseBlob<T>(raw: unknown): Promise<T> {
  if (raw instanceof Blob) return JSON.parse(await raw.text()) as T;
  return raw as T;
}
