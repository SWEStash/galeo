/** Document formats (ADR-003). `plain` is any other text file: source view only. */
export type FormatId = 'markdown' | 'text' | 'log' | 'plain';

/** How a tab shows its document: the format's rendered view or the read-only source view. */
export type ViewMode = 'rendered' | 'source';
