import type { TabRegistry } from '../tabs/registry';

/**
 * A launch's files in their target window (UX F1): each as a new tab in the order given, except
 * one the window already shows, which is shown instead of duplicated; the first file ends up shown.
 * They go after the shown tab, or after `after` (null: before every tab, as a drop there asks).
 */
export function openFiles(tabs: TabRegistry, window: number, files: readonly string[], after?: string | null): void {
  let first: string | undefined;
  // Where the next new tab goes: after the last one opened here, else where asked (null: first).
  let previous: string | null | undefined = after;
  for (const file of files) {
    const existing = tabs.find(file, window);
    const tab = existing ?? tabs.open(file, window, null, previous);
    if (!existing) previous = tab.id;
    first ??= tab.id;
  }
  if (first !== undefined) tabs.activate(first, window);
}
