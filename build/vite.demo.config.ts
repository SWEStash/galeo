import { mergeConfig, type Plugin, type PluginOption, type UserConfig } from 'vite';
import renderer from './vite.renderer.config.ts';

/** The window renderer's build, minus its bundle report: `check:bundle` measures the app's own page, not this one. */
const app = renderer({ command: 'build', mode: 'production' }) as UserConfig;
const ownReport = (plugin: PluginOption) => (plugin as Plugin | null)?.name === 'galeo-bundle-graph';

// The website's demo (#41): the window renderer, entered through src/demo, which supplies `window.galeo`.
export default mergeConfig(
  { ...app, plugins: app.plugins?.filter((plugin) => !ownReport(plugin)), worker: { ...app.worker, plugins: () => (app.worker?.plugins?.() ?? []).filter((plugin) => !ownReport(plugin)) } },
  // No source maps: the site serves the demo, and maps would triple its size.
  { root: 'src/demo', build: { outDir: '../../out/demo', emptyOutDir: true, sourcemap: false } },
);
