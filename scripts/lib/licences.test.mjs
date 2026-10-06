import { describe, expect, it } from 'vitest';
import { collectNotices, groupByText, licenceProblems } from './licences.mjs';

/** A package tree as `listDir`/`readText` see it: folder → { file: text }. */
function files(tree) {
  return {
    listDir: (dir) => Object.keys(tree[dir] ?? {}),
    readText: (file) => {
      const dir = file.slice(0, file.lastIndexOf('/'));
      return tree[dir][file.slice(dir.length + 1)];
    },
    readJson: (file) => JSON.parse(files(tree).readText(file)),
  };
}

const lock = (packages) => ({ packages: { '': { name: 'galeo' }, ...packages } });

describe('collectNotices', () => {
  it('lists runtime packages with their licence and notice files, never dev ones', () => {
    const notices = collectNotices(
      lock({
        'node_modules/b': { version: '2.0.0', license: 'Apache-2.0' },
        'node_modules/a': { version: '1.0.0', license: 'MIT' },
        'node_modules/vitest': { version: '5.0.0', license: 'MIT', dev: true },
      }),
      files({
        'node_modules/a': { 'package.json': '{}', LICENSE: 'MIT text', 'index.js': '' },
        'node_modules/b': { 'package.json': '{}', 'LICENSE.txt': 'Apache text', NOTICE: 'b notice', 'readme.md': '' },
      }),
    );
    expect(notices).toEqual([
      { name: 'a', version: '1.0.0', license: 'MIT', texts: ['MIT text'] },
      { name: 'b', version: '2.0.0', license: 'Apache-2.0', texts: ['Apache text', 'b notice'] },
    ]);
  });

  it('names nested packages by their own name, and reads licence-md and COPYING files', () => {
    const notices = collectNotices(
      lock({ 'node_modules/x/node_modules/@scope/y': { version: '1.0.0', license: 'ISC' } }),
      files({ 'node_modules/x/node_modules/@scope/y': { 'package.json': '{}', 'licence.md': 'ISC text', COPYING: 'more' } }),
    );
    expect(notices).toEqual([{ name: '@scope/y', version: '1.0.0', license: 'ISC', texts: ['ISC text', 'more'] }]);
  });

  it("takes an old-style `licenses` list, and states the licence and author when a package ships no text", () => {
    const notices = collectNotices(
      lock({ 'node_modules/f': { version: '0.2.2' } }),
      files({ 'node_modules/f': { 'package.json': JSON.stringify({ licenses: [{ type: 'MIT' }], author: 'Sami <s@x>' }) } }),
    );
    expect(notices).toEqual([{ name: 'f', version: '0.2.2', license: 'MIT', texts: ['Licensed under MIT by Sami <s@x>.'] }]);
  });
});

describe('licenceProblems', () => {
  const notice = (name, license) => ({ name, version: '1.0.0', license, texts: [] });

  it('accepts permissive licences, and an either-or with a permissive option', () => {
    const ok = ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'Unlicense', '(MPL-2.0 OR Apache-2.0)'];
    expect(licenceProblems(ok.map((license, n) => notice(`p${n}`, license)))).toEqual([]);
  });

  it('names copyleft, MPL-only and unknown licences', () => {
    expect(licenceProblems([notice('g', 'GPL-3.0'), notice('l', 'LGPL-2.1'), notice('m', 'MPL-2.0'), notice('u', 'unknown')])).toEqual([
      'g@1.0.0: GPL-3.0',
      'l@1.0.0: LGPL-2.1',
      'm@1.0.0: MPL-2.0',
      'u@1.0.0: unknown',
    ]);
  });
});

describe('groupByText', () => {
  it('lists the packages that ship the same terms once, under those terms', () => {
    const notice = (name, texts) => ({ name, version: '1.0.0', license: 'Apache-2.0', texts });
    expect(groupByText([notice('@react-aria/a', ['Apache']), notice('b', ['MIT b']), notice('@react-aria/c', ['Apache'])])).toEqual([
      { packages: [{ name: '@react-aria/a', version: '1.0.0', license: 'Apache-2.0' }, { name: '@react-aria/c', version: '1.0.0', license: 'Apache-2.0' }], texts: ['Apache'] },
      { packages: [{ name: 'b', version: '1.0.0', license: 'Apache-2.0' }], texts: ['MIT b'] },
    ]);
  });
});
