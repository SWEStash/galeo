import { describe, expect, it } from 'vitest';
import { writeTempTree as tree } from '../tests/helpers/index.ts';
import { checkExports } from './check-exports.mjs';

const unusedIn = (files) => checkExports(tree(files)).map((u) => `${u.file}:${u.line} ${u.name}${u.usedInFile ? ' local' : ''}`);

describe('checkExports', () => {
  it('accepts exports that another file imports', () => {
    expect(
      unusedIn({
        'src/shared/a.ts': 'export const A = 1;\nexport function f() {}\nexport interface I {}\nexport type T = string;\n',
        'src/core/b.ts': "import { A, f as g, type I } from '../shared/a';\nimport type { T } from '../shared/a.js';\n",
      }),
    ).toEqual([]);
  });

  it('reports an export nobody imports, and whether its own file uses it', () => {
    expect(
      unusedIn({
        'src/core/a.ts': 'export const LIMIT = 3;\nexport const SPREAD = {};\nexport const DEAD = 1;\nconst x = { ...SPREAD };\nexport const n = LIMIT + x.DEAD;\n',
        'src/core/b.ts': "import { n } from './a';\n",
      }),
    ).toEqual(['src/core/a.ts:1 LIMIT local', 'src/core/a.ts:2 SPREAD local', 'src/core/a.ts:3 DEAD']);
  });

  it('allows exports only tests import', () => {
    expect(
      unusedIn({
        'src/core/a.ts': 'export function helper() {}\nexport function other() {}\n',
        'src/core/a.test.ts': "import { helper } from './a';\n",
        'tests/unit/a.ts': "import { other } from '../../src/core/a';\n",
      }),
    ).toEqual([]);
  });

  it('counts namespace imports, dynamic imports and re-exports as using everything', () => {
    expect(
      unusedIn({
        'src/core/a.ts': 'export const A = 1;\n',
        'src/core/b.ts': 'export const B = 1;\n',
        'src/core/c.ts': 'export const C = 1;\n',
        'src/core/d.ts': 'export const D = 1;\n',
        'src/main/x.ts': "import * as a from '../core/a';\nconst b = import('../core/b');\nexport * from '../core/c';\nexport { D } from '../core/d';\n",
        'src/main/y.ts': "import { a } from './x';\n",
      }),
    ).toEqual([]);
  });

  it('reads export lists, default imports and imports from scripts and root configs', () => {
    expect(
      unusedIn({
        'src/core/a.ts': 'const a = 1;\nconst b = 2;\nexport { a, b as c };\nexport default a;\n',
        'src/core/e.ts': 'export const E = 1;\n',
        'src/renderer/m.ts': "import a from '../core/a';\n",
        'src/core/v.ts': 'export const V = 1;\n',
        'scripts/s.mjs': "import { E } from '../src/core/e.ts';\n",
        'vite.config.ts': "import { V } from './src/core/v';\n",
      }),
    ).toEqual(['src/core/a.ts:3 a local', 'src/core/a.ts:3 c']);
  });

  it('ignores commented-out imports and exports', () => {
    expect(
      unusedIn({
        'src/core/a.ts': '// export const OLD = 1;\nexport const A = 1;\n',
        'src/core/b.ts': "/* import { A } from './a'; */\n",
      }),
    ).toEqual(['src/core/a.ts:2 A']);
  });
});
