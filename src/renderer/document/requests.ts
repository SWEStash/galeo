import type { Events } from '../../shared/contracts';

/** Find in the shown document from a line, else from the reading position; a new `token` asks again for the same query. */
export interface FindRequest {
  query: string;
  caseSensitive: boolean;
  line?: number | undefined;
  token: number;
}

/** Main's word on edit mode for the tab (ADR-013); a new `token` is a new word. */
export interface EditRequest {
  edit: Events['documents.editMode']['edit'];
  /** Granted from Ctrl+H on a reading tab (ADR-038): replace opens once the editor shows. */
  replace?: true | undefined;
  token: number;
}

/** A diagram the reader asked to see larger, and where focus goes back when they close it. */
export interface DiagramExpand {
  svg: string;
  name: string;
  panel: boolean;
  returnFocus: () => void;
}
