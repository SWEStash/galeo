import { describe, expect, it } from 'vitest';
import { entryReports, lazyViolations } from './bundle-report.mjs';

const nm = (path) => `/repo/node_modules/${path}`;
const chunk = (fileName, { isEntry = false, imports = [], modules = [] } = {}) => ({
  fileName,
  isEntry,
  imports,
  modules: modules.map((id) => ({ id, bytes: 100 })),
});

describe('lazyViolations', () => {
  it('accepts heavy packages that only lazy chunks hold', () => {
    const chunks = [
      chunk('index.js', { isEntry: true, imports: ['shared.js'], modules: ['/repo/src/main.tsx'] }),
      chunk('shared.js', { modules: [nm('react/index.js')] }),
      chunk('katex.js', { modules: [nm('katex/dist/katex.mjs')] }),
      chunk('mermaid.core.js', { modules: [nm('mermaid/dist/mermaid.core.mjs')] }),
    ];
    expect(lazyViolations(chunks)).toEqual([]);
  });

  it('names a heavy package an entry reaches through static imports, inline CSS included', () => {
    const chunks = [
      chunk('render.worker.js', { isEntry: true, imports: ['pipeline.js'] }),
      chunk('pipeline.js', { imports: ['highlight.js'], modules: [nm('rehype-katex/lib/index.js')] }),
      chunk('highlight.js', { modules: [nm('@shikijs/core/dist/index.mjs')] }),
      chunk('index.js', { isEntry: true, modules: [`${nm('katex/dist/katex.min.css')}?inline`, nm('@codemirror/view/dist/index.js')] }),
    ];
    expect(lazyViolations(chunks)).toEqual([
      { entry: 'render.worker.js', chunk: 'pipeline.js', pkg: 'rehype-katex' },
      { entry: 'render.worker.js', chunk: 'highlight.js', pkg: '@shikijs/core' },
      { entry: 'index.js', chunk: 'index.js', pkg: 'katex' },
      { entry: 'index.js', chunk: 'index.js', pkg: '@codemirror/view' },
    ]);
  });

  it('matches package names exactly, not by prefix', () => {
    const chunks = [chunk('index.js', { isEntry: true, modules: [nm('katex-lite/index.js'), nm('mermaid-utils/index.js'), nm('@shikijsx/a.js')] })];
    expect(lazyViolations(chunks)).toEqual([]);
  });

  it('reports each package once per entry', () => {
    const chunks = [chunk('index.js', { isEntry: true, modules: [nm('katex/a.js'), nm('katex/b.js')] })];
    expect(lazyViolations(chunks)).toHaveLength(1);
  });
});

describe('entryReports', () => {
  it('sums what each entry loads before anything lazy', () => {
    const chunks = [
      chunk('index.js', { isEntry: true, imports: ['shared.js'], modules: ['/repo/src/a.ts', '/repo/src/b.ts'] }),
      chunk('shared.js', { modules: ['/repo/src/c.ts'] }),
      chunk('lazy.js', { modules: ['/repo/src/d.ts'] }),
    ];
    expect(entryReports(chunks)).toEqual([{ entry: 'index.js', chunks: ['index.js', 'shared.js'], bytes: 300 }]);
  });
});
