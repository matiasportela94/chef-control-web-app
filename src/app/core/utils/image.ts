/**
 * Achica la foto en el navegador antes de subirla.
 *
 * El backend guarda los bytes en la base, así que lo que no se achique acá se paga en tamaño de
 * base y de backup para siempre. Una foto de celular son 4MB; a 1200px de lado mayor y JPEG 0.82
 * queda en ~150KB y en una tarjeta se ve igual.
 *
 * Es una cortesía del cliente, no una garantía: el backend valida igual tamaño y formato real.
 */
export async function resizeImage(file: File, maxSide = 1200, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return file; // sin canvas, sube el original y que el backend decida
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise<Blob>(resolve => {
    canvas.toBlob(blob => resolve(blob ?? file), 'image/jpeg', quality);
  });
}
