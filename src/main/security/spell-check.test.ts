import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DICTIONARY, dictionarySource, installDictionary, SpellChecker } from './spell-check';

const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'galeo-spell-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function bundled(bytes = 'BDic words') {
  const source = path.join(temp(), DICTIONARY);
  writeFileSync(source, bytes);
  return source;
}

describe('dictionarySource', () => {
  it("is the package's resources folder when packaged, the repository's assets otherwise", () => {
    expect(dictionarySource({ isPackaged: true, resourcesPath: '/opt/galeo/resources', appPath: '/x' })).toBe(`/opt/galeo/resources/dictionaries/${DICTIONARY}`);
    expect(dictionarySource({ isPackaged: false, resourcesPath: '/x', appPath: '/src/galeo' })).toBe(path.join('/src/galeo', 'assets', 'dictionaries', 'en-US', DICTIONARY));
  });
});

describe('installDictionary (#52)', () => {
  it("copies the bundled dictionary where Chromium looks before it would download one, on Linux", () => {
    const source = bundled();
    const sessionData = temp();
    expect(installDictionary({ platform: 'linux', source, sessionData })).toBe(true);
    expect(readFileSync(path.join(sessionData, 'Dictionaries', DICTIONARY), 'utf8')).toBe('BDic words');
  });

  it('leaves a copy of the same size alone, and replaces one that differs', () => {
    const sessionData = temp();
    const target = path.join(sessionData, 'Dictionaries', DICTIONARY);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'BDic WORDS');
    const old = new Date('2026-01-01');
    utimesSync(target, old, old);

    installDictionary({ platform: 'linux', source: bundled('BDic words'), sessionData });
    expect(statSync(target).mtime).toEqual(old);
    installDictionary({ platform: 'linux', source: bundled('BDic more words'), sessionData });
    expect(readFileSync(target, 'utf8')).toBe('BDic more words');
  });

  it("installs nothing on macOS and Windows (the system's checker), or without the bundled file", () => {
    const sessionData = temp();
    expect(installDictionary({ platform: 'darwin', source: bundled(), sessionData })).toBe(false);
    expect(installDictionary({ platform: 'win32', source: bundled(), sessionData })).toBe(false);
    expect(installDictionary({ platform: 'linux', source: path.join(temp(), 'missing.bdic'), sessionData })).toBe(false);
    expect(() => statSync(path.join(sessionData, 'Dictionaries'))).toThrow();
  });
});

class FakeSession {
  calls: string[] = [];
  availableSpellCheckerLanguages = ['en-US', 'es-ES', 'de-DE'];
  setSpellCheckerLanguages(languages: string[]) {
    this.calls.push(`languages ${languages.join(',')}`);
  }
  setSpellCheckerEnabled(enabled: boolean) {
    this.calls.push(`enabled ${enabled}`);
  }
}

describe('SpellChecker (#52)', () => {
  it('turns the checker on with the shipped language the first time a profile wants it, on Linux', () => {
    const session = new FakeSession();
    const checker = new SpellChecker(session, { platform: 'linux', installed: true, systemLanguages: ['es-ES'] });
    checker.want(false);
    expect(session.calls).toEqual([]);
    checker.want(true);
    checker.want(true);
    checker.want(false);
    expect(session.calls).toEqual(['languages en-US', 'enabled true']);
  });

  it("stays off on Linux without the dictionary, so nothing would be downloaded", () => {
    const session = new FakeSession();
    new SpellChecker(session, { platform: 'linux', installed: false, systemLanguages: [] }).want(true);
    expect(session.calls).toEqual([]);
  });

  it("uses the system's languages on Windows, and macOS's own on macOS", () => {
    const windows = new FakeSession();
    new SpellChecker(windows, { platform: 'win32', installed: false, systemLanguages: ['es-ES', 'fr-FR', 'en-US'] }).want(true);
    expect(windows.calls).toEqual(['languages es-ES,en-US', 'enabled true']);
    const mac = new FakeSession();
    new SpellChecker(mac, { platform: 'darwin', installed: false, systemLanguages: ['de-DE'] }).want(true);
    expect(mac.calls).toEqual(['enabled true']);
  });
});
