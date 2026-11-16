import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Spell check in edit mode (#52), with no download. On Linux Chromium spell-checks with Hunspell
 * dictionaries it fetches from Google; galeo ships Chromium's English (US) one and puts it where
 * Chromium looks first. The name carries Chromium's dictionary format version: an Electron update
 * that moves it on needs the new file (an e2e catches it). macOS and Windows use the system's checker.
 */
export const DICTIONARY = 'en-US-10-2.bdic';

/** The dictionary galeo ships: beside the app when packaged, in the repository's assets otherwise. */
export function dictionarySource({ isPackaged, resourcesPath, appPath }: { isPackaged: boolean; resourcesPath: string; appPath: string }): string {
  return isPackaged ? `${resourcesPath}/dictionaries/${DICTIONARY}` : path.join(appPath, 'assets', 'dictionaries', 'en-US', DICTIONARY);
}

const sizeOf = (file: string) => {
  try {
    return statSync(file).size;
  } catch {
    return null;
  }
};

/**
 * Puts the shipped dictionary in the session's `Dictionaries` folder, before the app is ready, unless a
 * copy of the same size is there. Linux only; whether the dictionary is there to use.
 */
export function installDictionary({ platform, source, sessionData }: { platform: NodeJS.Platform; source: string; sessionData: string }): boolean {
  if (platform !== 'linux') return false;
  const size = sizeOf(source);
  if (size === null) return false;
  const target = path.join(sessionData, 'Dictionaries', DICTIONARY);
  if (sizeOf(target) === size) return true;
  try {
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
    return true;
  } catch (error) {
    console.warn('galeo: spell-check dictionary not installed', error);
    return false;
  }
}

/** What the spell checker needs of Electron's session. */
interface SpellCheckSession {
  readonly availableSpellCheckerLanguages: readonly string[];
  setSpellCheckerLanguages(languages: string[]): void;
  setSpellCheckerEnabled(enabled: boolean): void;
}

/**
 * Turns the session's checker on the first time a profile wants spell check, and leaves it on: each
 * editor's `spellcheck` attribute decides what is marked, so profiles can differ in one session.
 */
export class SpellChecker {
  private on = false;

  constructor(
    private readonly session: SpellCheckSession,
    private readonly options: { platform: NodeJS.Platform; installed: boolean; systemLanguages: readonly string[] },
  ) {}

  want(wanted: boolean): void {
    if (!wanted || this.on) return;
    const { platform, installed, systemLanguages } = this.options;
    // Without its dictionary Chromium would try to download one: stay off.
    if (platform === 'linux' && !installed) return;
    this.on = true;
    if (platform === 'linux') this.session.setSpellCheckerLanguages(['en-US']);
    // macOS picks the languages itself; Windows checks the system's languages that it offers.
    if (platform === 'win32') {
      const offered = new Set(this.session.availableSpellCheckerLanguages);
      this.session.setSpellCheckerLanguages(systemLanguages.filter((language) => offered.has(language)));
    }
    this.session.setSpellCheckerEnabled(true);
  }
}
