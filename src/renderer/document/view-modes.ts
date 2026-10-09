import type { ViewMode } from '../../shared/formats';

/** A single view: what split leaves for. */
export type SingleView = Exclude<ViewMode, 'split'>;

/** The view a toggle leads to, or why it doesn't apply here. */
export type ViewToggle = { view: ViewMode } | { refused: string };

/**
 * Ctrl+\ (ADR-014): into split, or back out to the single view the reader had; while editing,
 * back out to the source, as the rendered view alone isn't offered then.
 */
export function afterToggleSplit(view: ViewMode, { splittable, editing, lastSingle }: { splittable: boolean; editing: boolean; lastSingle: SingleView }): ViewToggle {
  if (!splittable) return { refused: 'Split view is for Markdown files' };
  if (view !== 'split') return { view: 'split' };
  return { view: editing ? 'source' : lastSingle };
}

/** Ctrl+U: the other single view; out of split, the source while editing and the rendered view when reading. */
export function afterToggleSource(view: ViewMode, { editing }: { editing: boolean }): ViewToggle {
  if (view === 'split') return { view: editing ? 'source' : 'rendered' };
  if (editing) return { refused: 'Leave edit mode (Ctrl+E) to see the rendered view' };
  return { view: view === 'rendered' ? 'source' : 'rendered' };
}

/** Edit mode shows the editor: split keeps it beside the preview, any other view becomes the source. */
export function viewForEditing(view: ViewMode): ViewMode {
  return view === 'split' ? 'split' : 'source';
}

/** What a too-narrow window shows of a split: the text being typed, else the rendered view. */
export function shownView(view: ViewMode, { narrow, editing }: { narrow: boolean; editing: boolean }): ViewMode {
  if (view !== 'split' || !narrow) return view;
  return editing ? 'source' : 'rendered';
}
