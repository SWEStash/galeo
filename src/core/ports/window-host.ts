import type { Unsubscribe } from './common';

/** A window's id: its page's id (Electron's `webContents.id`), the key tabs, grants and metrics use. */
export type WindowId = number;

export interface MenuItem {
  id: string;
  label: string;
  enabled?: boolean;
}

/** Native windows. Main observes capability keys and builds menus itself (ADR-004). */
export interface WindowHost {
  create(options: { title: string }): WindowId;
  focus(id: WindowId): void;
  close(id: WindowId): void;
  setTitle(id: WindowId, title: string): void;
  onFocus(listener: (id: WindowId) => void): Unsubscribe;
  onClosed(listener: (id: WindowId) => void): Unsubscribe;
  /** A capability accelerator (for example open-with-default-app) pressed in a window. */
  onCapabilityKey(listener: (id: WindowId, key: string) => void): Unsubscribe;
  /** Shows a native context menu; resolves with the chosen item id, or null when dismissed. */
  showContextMenu(id: WindowId, items: readonly MenuItem[]): Promise<string | null>;
}
