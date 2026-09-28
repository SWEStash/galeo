import type { MenuItemConstructorOptions } from 'electron';

/**
 * The application menu. Electron's default one binds Ctrl+W, Ctrl+R and others before the page
 * sees them, so there is none; macOS keeps its app and edit menus, which its text editing
 * shortcuts need.
 */
export function applicationMenu(platform: NodeJS.Platform): MenuItemConstructorOptions[] | null {
  return platform === 'darwin' ? [{ role: 'appMenu' }, { role: 'editMenu' }] : null;
}
