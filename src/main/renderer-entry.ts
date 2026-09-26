export type RendererEntry = { url: string } | { file: string };

/**
 * Where a window loads its UI from: the Vite dev server in development runs, otherwise the built
 * renderer (path relative to `out/`). Packaged builds never honour the dev server variable, so
 * the environment can't point the installed app at another page.
 */
export function rendererEntry({
  isPackaged,
  env,
}: {
  isPackaged: boolean;
  env: Record<string, string | undefined>;
}): RendererEntry {
  const devServerUrl = env['GALEO_DEV_SERVER_URL'];
  if (!isPackaged && devServerUrl) return { url: devServerUrl };
  return { file: 'renderer/index.html' };
}
