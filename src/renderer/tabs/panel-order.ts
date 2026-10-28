/**
 * The order to draw the tab panels in: the order they were opened, not the tab order. Moving a tab
 * then never moves a panel's element, which would lose its scroll position.
 */
export function panelOrder(previous: readonly string[], tabs: readonly string[]): string[] {
  const open = new Set(tabs);
  const kept = previous.filter((id) => open.has(id));
  const known = new Set(kept);
  return [...kept, ...tabs.filter((id) => !known.has(id))];
}
