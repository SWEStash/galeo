/** Document formats (ADR-003). `plain` is any other text file: source view only. */
export type FormatId = 'markdown' | 'text' | 'log' | 'plain';

/** How a tab shows its document: the format's rendered view, the source view, or both side by side. */
export type ViewMode = 'rendered' | 'source' | 'split';

/** A split's narrowest pane, as a fraction of the width (ADR-014). */
export const SPLIT_MIN_RATIO = 0.2;
export const SPLIT_MAX_RATIO = 1 - SPLIT_MIN_RATIO;
