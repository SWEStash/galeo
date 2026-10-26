import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeTempTree as tree } from '../tests/helpers/index.ts';
import { checkDocs } from './check-docs.mjs';

const THREAT_MODEL = 'docs/security/threat-model.md';
const BASE = {
  [THREAT_MODEL]: '# Threat model\n\n**SR-01 — Hardened renderers.** Text.\n',
  'docs/decisions/ADR-001-app-shell-stack.md': '# ADR-001\n',
};

const problemsIn = (files) => checkDocs(tree({ ...BASE, ...files })).map((p) => `${p.file}:${p.line} ${p.message}`);

describe('checkDocs: links', () => {
  it('accepts links to files, folders and headings that exist', () => {
    expect(
      problemsIn({
        'README.md': '# galeo\n\nSee [usage](docs/USAGE.md#opening-files), [ADRs](docs/decisions/) and [top](#galeo).\n',
        'docs/USAGE.md': '# Using galeo\n\n## Opening files\n\nBack to [the README](../README.md).\n',
      }),
    ).toEqual([]);
  });

  it('reports a relative link to a missing file', () => {
    expect(problemsIn({ 'README.md': '# galeo\n\n[gone](docs/GONE.md)\n' })).toEqual([
      'README.md:3 link to a missing file: docs/GONE.md',
    ]);
  });

  it('reports an anchor to a missing heading, in the same file or another', () => {
    expect(
      problemsIn({
        'README.md': '# galeo\n\n[a](#nowhere) and [b](docs/USAGE.md#nowhere)\n',
        'docs/USAGE.md': '# Using galeo\n',
      }),
    ).toEqual(['README.md:3 link to a missing heading: #nowhere', 'README.md:3 link to a missing heading: docs/USAGE.md#nowhere']);
  });

  it('checks reference-style definitions and images too', () => {
    expect(problemsIn({ 'README.md': '# galeo\n\n![logo](logo.svg)\n\n[x]: missing.md\n' })).toEqual([
      'README.md:3 link to a missing file: logo.svg',
      'README.md:5 link to a missing file: missing.md',
    ]);
  });

  it('never follows web or mail links', () => {
    expect(problemsIn({ 'README.md': '# galeo\n\n[ci](https://example.invalid/x) [m](mailto:a@example.invalid)\n' })).toEqual([]);
  });
});

describe('checkDocs: ids', () => {
  it('reports an ADR id with no decision record', () => {
    expect(problemsIn({ 'docs/a.md': '# A\n\nSee ADR-001 and ADR-099.\n' })).toEqual(['docs/a.md:3 unknown decision record: ADR-099']);
  });

  it('reports an SR id the threat model does not define', () => {
    expect(problemsIn({ 'docs/a.md': '# A\n\nSR-01 holds; SR-42 does not exist.\n' })).toEqual(['docs/a.md:3 unknown security requirement: SR-42']);
  });
});

describe('checkDocs: paths in code spans', () => {
  it('reports a repository path that does not exist, ignoring line suffixes and patterns', () => {
    expect(
      problemsIn({
        'src/main/index.ts': '\n',
        'docs/a.md':
          '# A\n\n`src/main/index.ts:12-30`, `src/main/` and `src/**/*.ts`, `src/{a,b}.ts`, `src/<x>.ts`, `src/…`\n\n`src/main/gone.ts:4`\n\n```\nsrc/in/a/block.ts\n```\n',
      }),
    ).toEqual(['docs/a.md:5 path not found: src/main/gone.ts']);
  });

  it('leaves paths in dated audits alone, since they record the tree as it was', () => {
    expect(problemsIn({ 'docs/security/audits/2026-01-01-v0.1.md': '# Audit\n\n`src/main/old.ts`\n' })).toEqual([]);
  });
});

describe('check-docs CLI', () => {
  const script = path.join(import.meta.dirname, 'check-docs.mjs');

  it('exits 1 and prints file:line for each problem', () => {
    const root = tree({ ...BASE, 'README.md': '# galeo\n\n[gone](GONE.md)\n' });
    const run = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('README.md:3 link to a missing file: GONE.md');
  });

  it('exits 0 on a clean tree', () => {
    const run = spawnSync(process.execPath, [script, tree({ ...BASE, 'README.md': '# galeo\n' })], { encoding: 'utf8' });
    expect(run.status).toBe(0);
  });
});
