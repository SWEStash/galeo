import type { CSSProperties } from 'react';
import type { ReaderWidth } from '../../shared/tabs';
import type { TabStatus } from '../tabs/store';

/** The reading column's narrowest and widest widths in `ch`, as the `measure` setting allows. */
const NARROWEST = 40;
const WIDEST = 200;
/** Widen and narrow move between multiples of this many `ch`. */
const STEP = 8;

/**
 * The tab's reader width after Widen (`wider`), Narrow (`narrower`), Reset (`reset`) or Full width
 * (`full`, which toggles back), given its own width (null: none) and the `measure` setting. A width
 * equal to the setting comes back as null, so the tab follows the setting when it changes.
 */
export function widthStep(
  current: ReaderWidth | null,
  setting: ReaderWidth,
  direction: 'wider' | 'narrower' | 'reset' | 'full',
): ReaderWidth | null {
  const shown = current ?? setting;
  let next: ReaderWidth;
  if (direction === 'reset') return null;
  if (direction === 'full') next = shown === 'full' ? setting : 'full';
  else if (shown === 'full') next = direction === 'wider' ? 'full' : WIDEST;
  else if (direction === 'wider') next = Math.min(WIDEST, (Math.floor(shown / STEP) + 1) * STEP);
  else next = Math.max(NARROWEST, (Math.ceil(shown / STEP) - 1) * STEP);
  return next === setting ? null : next;
}

/** The width as the status bar shows it. */
export function widthLabel(width: ReaderWidth): string {
  return width === 'full' ? 'Full width' : `${width} ch`;
}

/** Formats whose rendered view is prose in a reading column (Markdown's article, the text reader). */
const COLUMNED = new Set<TabStatus['format']>(['markdown', 'mdx', 'text']);

/** Whether the tab shows a reading column now, so its reader width means something. */
export function hasReadingColumn(status: Pick<TabStatus, 'format' | 'view' | 'table'> | undefined): boolean {
  return !!status && (status.view === 'rendered' || status.view === 'split') && !status.table && COLUMNED.has(status.format);
}

/** The tab's own width as the `--galeo-measure` it shows its documents with; none while it follows the setting. */
export function readerWidthStyle(width: ReaderWidth | undefined): CSSProperties {
  if (width === undefined) return {};
  return { '--galeo-measure': width === 'full' ? 'none' : `${width}ch` } as CSSProperties;
}
