import type { TabRegistry } from '../tabs/registry';

/**
 * A launch's files in their target window (UX F1): each as a new tab in the order given, except
 * one the window already shows, which is shown instead of duplicated; the first file ends up shown.
 */
export function openFiles(tabs: TabRegistry, window: number, files: readonly string[]): void {
  let first: string | undefined;
  let previous: string | undefined;
  for (const file of files) {
    const existing = tabs.find(file, window);
    const tab = existing ?? tabs.open(file, window, null, previous);
    if (!existing) previous = tab.id;
    first ??= tab.id;
  }
  if (first !== undefined) tabs.activate(first, window);
}
