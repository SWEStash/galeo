/** Hand-offs to the desktop. Callers check capabilities first (SR-04, SR-05). */
export interface OsShell {
  openExternal(url: string): Promise<void>;
  openPath(path: string): Promise<void>;
  revealInFileManager(path: string): void;
}
