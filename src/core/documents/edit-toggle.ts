/** What Ctrl+E does to a tab (ADR-015). */
export type EditToggle = 'leave' | 'refuse' | 'grant' | 'ask';

/**
 * `granted`: the tab is in edit mode. `text`: main last read the tab's file as text with content.
 * `chosen`: the reader handed that file over, or confirmed editing it.
 */
export function editToggle({ granted, text, chosen }: { granted: boolean; text: boolean; chosen: boolean }): EditToggle {
  if (granted) return 'leave';
  if (!text) return 'refuse';
  return chosen ? 'grant' : 'ask';
}
