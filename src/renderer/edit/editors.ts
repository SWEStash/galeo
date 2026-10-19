/** What the page can do with a tab's unsaved edits, wherever the question comes from (ADR-013). */
export interface Editor {
  /** Saves; true once the text is on disk and nothing is left unsaved. */
  save(): Promise<boolean>;
  /** Drops the edits: the tab shows the file again. */
  discard(): void;
  /** Puts the caret back in the editor. */
  focus(): void;
  /** Hands main the unsaved text now, not a moment after typing stops: the tab is about to move (ADR-019). */
  keepNow(): void;
}

/** The window's tabs in edit mode, by tab id. */
export const editors = new Map<string, Editor>();
