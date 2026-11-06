/** A canvas side larger than this fails to draw in Chromium: big diagrams scale down to fit. */
const MAX_SIDE = 16_384;

/**
 * A PNG of the diagram's sanitized SVG (#59), drawn at `scale` times its size (sharper when pasted),
 * on a white ground when it was drawn for a light panel. The SVG has no foreign content, so the canvas
 * stays readable.
 */
export async function pngOf(svg: string, size: { width: number; height: number }, { scale = 2, light = false } = {}): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  const image = new Image();
  image.src = `data:image/svg+xml;base64,${btoa(binary)}`;
  await image.decode();
  const fit = Math.min(scale, MAX_SIDE / Math.max(size.width, 1), MAX_SIDE / Math.max(size.height, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(size.width * fit));
  canvas.height = Math.max(1, Math.round(size.height * fit));
  const context = canvas.getContext('2d')!;
  if (light) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('the diagram did not draw');
  return new Uint8Array(await blob.arrayBuffer());
}
