import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { collectNotices, groupByText, licenceProblems } from '../scripts/lib/licences.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ID = 'virtual:licences';

const files = {
  listDir: (dir: string) => readdirSync(path.join(ROOT, dir)),
  readText: (file: string) => readFileSync(path.join(ROOT, file), 'utf8'),
  readJson: (file: string) => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8')),
};

/**
 * `virtual:licences`: the notices the About dialog shows, gathered at build time: the
 * runtime packages' terms (grouped where identical), the vendored fonts' OFL texts and Electron's
 * licence. The build fails on a runtime package whose licence isn't permissive.
 */
export function licences(): Plugin {
  return {
    name: 'galeo-licences',
    resolveId: (id) => (id === ID ? `\0${ID}` : null),
    load(id) {
      if (id !== `\0${ID}`) return null;
      const notices = collectNotices(JSON.parse(files.readText('package-lock.json')), files);
      const problems = licenceProblems(notices);
      if (problems.length > 0) this.error(`runtime packages without a permissive licence: ${problems.join(', ')}`);
      const fonts = readdirSync(path.join(ROOT, 'assets/fonts'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
          const dir = `assets/fonts/${entry.name}`;
          const licence = files.listDir(dir).find((file) => /^OFL/i.test(file))!;
          return { name: entry.name, text: files.readText(`${dir}/${licence}`) };
        });
      // The licence that ships with the Electron binary; a build without the binary (the website demo, from
      // `npm ci --ignore-scripts`) takes the package's own copy of it.
      const binary = 'node_modules/electron/dist/LICENSE';
      const electron = files.readText(existsSync(path.join(ROOT, binary)) ? binary : 'node_modules/electron/LICENSE');
      return `export default ${JSON.stringify({ packages: groupByText(notices), fonts, electron })};`;
    },
  };
}
