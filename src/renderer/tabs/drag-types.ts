/** A tab being dragged: the tab bars of every galeo window take it, nothing else does (ADR-019). */
export const TAB_TYPE = 'application/x-galeo-tab';

/** A card dragged within the tab overview: it reorders that window's tabs and is never a file drop. */
export const CARD_TYPE = 'application/x-galeo-card';

/** A drag from a galeo tab bar or tab overview: no drop area takes it as files. */
export function fromGaleo(types: { has(type: string): boolean }): boolean {
  return types.has(TAB_TYPE) || types.has(CARD_TYPE);
}
