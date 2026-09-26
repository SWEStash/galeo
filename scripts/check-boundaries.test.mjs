import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeTempTree as tree } from '../tests/helpers/index.ts';
import { checkBoundaries } from './check-boundaries.mjs';

const violationsIn = (files) => checkBoundaries(tree(files)).map((v) => `${v.file}:${v.line} ${v.specifier}`);

describe('checkBoundaries: direct imports', () => {
  it('accepts a tree that follows the rules', () => {
    expect(
      violationsIn({
        'src/shared/ids.ts': 'export type TabId = string;\n',
        'src/core/router.ts': "import type { TabId } from '../shared/ids';\nimport { fromMarkdown } from 'mdast-util-from-markdown';\n",
        'src/main/index.ts': "import { app } from 'electron';\nimport fs from 'node:fs';\nimport { route } from '../core/router';\n",
        'src/preload/index.ts': "import { contextBridge } from 'electron';\n",
        'src/renderer/App.tsx': "import { useState } from 'react';\nimport type { TabId } from '../shared/ids';\n",
      }),
    ).toEqual([]);
  });

  it.each([
    ['core', "import { app } from 'electron';"],
    ['core', "import fs from 'node:fs';"],
    ['core', "import fs from 'fs';"],
    ['core', "import { readFile } from 'fs/promises';"],
    ['core', "import type { BrowserWindow } from 'electron';"],
    ['shared', "import { ipcMain } from 'electron';"],
    ['shared', "import path from 'node:path';"],
    ['renderer', "import { ipcRenderer } from 'electron';"],
    ['renderer', "import path from 'node:path';"],
  ])('rejects Electron and Node imports in %s: %s', (folder, statement) => {
    expect(violationsIn({ [`src/${folder}/a.ts`]: `${statement}\n` })).toHaveLength(1);
  });

  it.each([
    ['core', "import { createWindow } from '../main/window';"],
    ['core', "import { api } from '../preload/index';"],
    ['core', "import { App } from '../renderer/App';"],
    ['shared', "import { route } from '../core/router';"],
    ['renderer', "import { createWindow } from '../main/window';"],
    ['renderer', "import { route } from '../core/router';"],
    ['preload', "import { createWindow } from '../main/window';"],
  ])('rejects imports that point outward from %s: %s', (folder, statement) => {
    expect(violationsIn({ [`src/${folder}/a.ts`]: `${statement}\n` })).toHaveLength(1);
  });

  it.each([
    "export { app } from 'electron';",
    "export * from 'node:fs';",
    "const fs = await import('node:fs');",
    "const { app } = require('electron');",
    "import 'electron';",
    "import {\n  app,\n  BrowserWindow,\n} from 'electron';",
  ])('detects every import form: %s', (statement) => {
    expect(violationsIn({ 'src/core/a.ts': `${statement}\n` })).toHaveLength(1);
  });

  it('ignores imports inside comments', () => {
    expect(
      violationsIn({
        'src/core/a.ts': "// import { app } from 'electron';\n/*\n import fs from 'node:fs';\n*/\nexport {};\n",
      }),
    ).toEqual([]);
  });

  it('is not thrown off by a quote inside a regex literal', () => {
    expect(violationsIn({ 'src/core/a.ts': "const quote = /'/; const url = 'https://example.com'; import fs from 'node:fs';\n" })).toEqual([
      'src/core/a.ts:1 node:fs',
    ]);
  });

  it('reports the file and line of each violation', () => {
    expect(violationsIn({ 'src/core/a.ts': "export const x = 1;\n\nimport fs from 'node:fs';\n" })).toEqual([
      'src/core/a.ts:3 node:fs',
    ]);
  });
});

describe('checkBoundaries: zod stays in main', () => {
  const contracts = {
    'src/shared/schemas.ts': "import { z } from 'zod';\nexport const AppInfo = z.object({});\nexport type AppInfo = z.infer<typeof AppInfo>;\n",
    'src/shared/channels.ts': "export const channels = ['app.info'] as const;\n",
  };

  it.each(['renderer', 'preload'])('rejects a value import of zod in %s', (folder) => {
    expect(violationsIn({ [`src/${folder}/a.ts`]: "import { z } from 'zod';\n" })).toEqual([`src/${folder}/a.ts:1 zod`]);
  });

  it('rejects zod subpath imports', () => {
    expect(violationsIn({ 'src/renderer/a.ts': "import { z } from 'zod/mini';\n" })).toHaveLength(1);
  });

  it('allows type-only imports of zod and of schema modules', () => {
    expect(
      violationsIn({
        ...contracts,
        'src/renderer/a.ts': "import type { ZodType } from 'zod';\nimport type { AppInfo } from '../shared/schemas';\n",
      }),
    ).toEqual([]);
  });

  it.each(['renderer', 'preload'])('rejects %s reaching zod through a shared module', (folder) => {
    expect(
      violationsIn({ ...contracts, [`src/${folder}/a.ts`]: "import { AppInfo } from '../shared/schemas';\n" }),
    ).toEqual([`src/${folder}/a.ts:1 ../shared/schemas`]);
  });

  it('follows chains of shared modules and names the path', () => {
    const root = tree({
      ...contracts,
      'src/shared/index.ts': "export * from './schemas.js';\n",
      'src/renderer/a.ts': "import { AppInfo } from '../shared';\n",
    });
    const [violation] = checkBoundaries(root);
    expect(violation.message).toContain('src/shared/index.ts → src/shared/schemas.ts → zod');
  });

  it('allows value imports of shared modules that do not reach zod', () => {
    expect(violationsIn({ ...contracts, 'src/preload/a.ts': "import { channels } from '../shared/channels';\n" })).toEqual([]);
  });

  it('allows zod in main and core', () => {
    expect(
      violationsIn({
        ...contracts,
        'src/main/ipc.ts': "import { AppInfo } from '../shared/schemas';\nimport { z } from 'zod';\n",
        'src/core/settings.ts': "import { z } from 'zod';\n",
      }),
    ).toEqual([]);
  });

  it('terminates on import cycles', () => {
    expect(
      violationsIn({
        'src/shared/a.ts': "import { b } from './b';\nexport const a = 1;\n",
        'src/shared/b.ts': "import { a } from './a';\nexport const b = 2;\n",
        'src/renderer/x.ts': "import { a } from '../shared/a';\n",
      }),
    ).toEqual([]);
  });
});

describe('check-boundaries CLI', () => {
  const script = path.join(import.meta.dirname, 'check-boundaries.mjs');
  const run = (root) => spawnSync(process.execPath, [script, root], { encoding: 'utf8' });

  it('exits 0 when there are no violations', () => {
    const result = run(tree({ 'src/core/a.ts': 'export {};\n' }));
    expect(result.status).toBe(0);
  });

  it('exits 1 and prints each violation with its location and rule', () => {
    const result = run(tree({ 'src/core/a.ts': "import { app } from 'electron';\n" }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/core/a.ts:1: 'electron': src/core must not import Electron or Node modules");
  });
});
