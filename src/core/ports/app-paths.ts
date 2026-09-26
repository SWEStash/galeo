/** Per-user directories (XDG on Linux). */
export interface AppPaths {
  readonly configDir: string;
  readonly stateDir: string;
  readonly cacheDir: string;
}
