/** The system clipboard; main writes to it, never the page (a copy the page asks for is plain text). */
export interface Clipboard {
  writeText(text: string): void;
}
