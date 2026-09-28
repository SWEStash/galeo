import { BrowserWindow, Menu, webContents } from 'electron';
import type { MenuItem } from '../../core/ports';

/**
 * Shows a native menu in the window of `windowId` (a web contents id) at the pointer; resolves
 * with the chosen item id, or null when dismissed. Unpackaged test runs can answer instead
 * (`GALEO_TEST_MENU_CHOICE`); the menus they would have shown are `globalThis.__galeoMenus`.
 */
export function showNativeMenu(windowId: number, items: readonly MenuItem[], isPackaged: boolean): Promise<string | null> {
  const answer = !isPackaged ? process.env['GALEO_TEST_MENU_CHOICE'] : undefined;
  if (answer !== undefined) {
    ((globalThis as { __galeoMenus?: (readonly MenuItem[])[] }).__galeoMenus ??= []).push(items);
    return Promise.resolve(items.some((item) => item.id === answer) ? answer : null);
  }
  const contents = webContents.fromId(windowId);
  const window = contents && BrowserWindow.fromWebContents(contents);
  if (!window) return Promise.resolve(null);
  return new Promise((resolve) => {
    // A choice resolves at once; the close callback may come before or after it, so it answers
    // null only on the next turn, when a click would already have resolved.
    const menu = Menu.buildFromTemplate(
      items.map((item) => ({ label: item.label, enabled: item.enabled ?? true, click: () => resolve(item.id) })),
    );
    menu.popup({ window, callback: () => setImmediate(() => resolve(null)) });
  });
}
