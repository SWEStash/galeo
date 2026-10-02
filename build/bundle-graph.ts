import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const OUT = path.resolve(import.meta.dirname, '../out/bundle');

/**
 * Records each chunk of a build (its static imports and the modules it holds) in
 * `out/bundle/<name>.json`, for `scripts/bundle-report.mjs`. Not packaged.
 */
export function bundleGraph(name: string): Plugin {
  return {
    name: 'galeo-bundle-graph',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).flatMap((output) =>
        output.type === 'chunk'
          ? [
              {
                fileName: output.fileName,
                isEntry: output.isEntry,
                imports: output.imports,
                modules: Object.entries(output.modules).map(([id, module]) => ({ id, bytes: module.renderedLength })),
              },
            ]
          : [],
      );
      mkdirSync(OUT, { recursive: true });
      writeFileSync(path.join(OUT, `${name}.json`), `${JSON.stringify(chunks, null, 1)}\n`);
    },
  };
}
