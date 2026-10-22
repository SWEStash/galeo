import type { TabStatus } from './store';

/** A tab indicator (UX F4): a glyph, and the words a screen reader hears in the tab's name. */
export interface Indicator {
  glyph: string;
  words: string;
}

/** Tab indicators (UX F4): always a glyph with words, never colour alone. The tab bar and the tab overview show them. */
export function indicators(status: TabStatus | undefined, reloaded: boolean, crashed: boolean): Indicator[] {
  const shown = [];
  if (crashed) shown.push({ glyph: '⚠', words: 'crashed the viewer' });
  if (reloaded) shown.push({ glyph: '↻', words: 'reloaded from disk' });
  if (status?.follow) shown.push({ glyph: '⇣', words: 'following the end' });
  if (status?.state === 'missing') shown.push({ glyph: '✕', words: 'file missing' });
  if (status?.editing) shown.push({ glyph: '✎', words: 'edit mode' });
  if (status?.dirty) shown.push({ glyph: '●', words: 'unsaved changes' });
  return shown;
}
