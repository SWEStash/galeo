import type { Locator, Page } from '@playwright/test';

/**
 * How `element` overlaps the native window controls drawn over the title bar's right end, or null
 * when it is clear of them.
 */
export async function windowControlsOverlap(page: Page, element: Locator): Promise<string | null> {
  // macOS draws its traffic lights at the top left instead, in the 78 px the title bar keeps
  // free for them (`app.css`, `data-platform='darwin'`), with no overlay API.
  if (process.platform === 'darwin') return overlap(await element.boundingBox(), { left: 0, right: 78, bottom: 36 });
  const controls = await page.evaluate(() => {
    // Window Controls Overlay API; TypeScript's DOM types don't have it yet.
    const overlay = (navigator as Navigator & { windowControlsOverlay: { getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay;
    const area = overlay.getTitlebarAreaRect();
    return { left: area.x + area.width, bottom: area.y + area.height, right: window.innerWidth };
  });
  // Without the overlay there are no controls to clear, and the check would pass vacuously.
  if (controls.left >= controls.right || controls.bottom <= 0) throw new Error('no window controls overlay');
  return overlap(await element.boundingBox(), controls);
}

function overlap(box: { x: number; y: number; width: number; height: number } | null, controls: { left: number; right: number; bottom: number }): string | null {
  if (!box) throw new Error('element is not visible');
  const overlaps = box.x + box.width > controls.left && box.x < controls.right && box.y < controls.bottom;
  return overlaps ? `element ${JSON.stringify(box)} overlaps controls ${JSON.stringify(controls)}` : null;
}
