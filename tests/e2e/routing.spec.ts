import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { appDirs, launchApp, launchSecond, removeTempHome, tempHome } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const basic = path.join(docs, 'basic.md');
const gfm = path.join(docs, 'gfm.md');
const math = path.join(docs, 'math.md');

const snapshot = (page: Page) => page.evaluate(() => window.galeo.tabs.snapshot());
const paths = async (page: Page) => (await snapshot(page)).tabs.map((tab) => tab.path);
const shownPath = async (page: Page) => {
  const { tabs, active } = await snapshot(page);
  return tabs.find((tab) => tab.id === active)?.path;
};

test('a later launch adds its files to the running window as tabs, shows the first, and exits', async () => {
  const home = tempHome();
  const { app, window, close } = await launchApp(['--', basic], { home });
  try {
    await expect.poll(() => paths(window)).toEqual([basic]);
    const second = launchSecond(home, ['--', gfm, math]);
    expect(second.status).toBe(0);
    await expect.poll(() => paths(window)).toEqual([basic, gfm, math]);
    await expect.poll(() => shownPath(window)).toBe(gfm);
    expect(app.windows()).toHaveLength(1);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('a file the window already has is shown, not opened twice', async () => {
  const home = tempHome();
  const { window, close } = await launchApp(['--', basic, gfm], { home });
  try {
    await expect.poll(() => paths(window)).toEqual([basic, gfm]);
    expect(launchSecond(home, ['--', gfm]).status).toBe(0);
    await expect.poll(() => shownPath(window)).toBe(gfm);
    expect(await paths(window)).toEqual([basic, gfm]);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('a path that does not exist opens as a missing tab, so a typo shows', async () => {
  const home = tempHome();
  const { window, close } = await launchApp([], { home });
  try {
    await expect(window.getByTestId('app-root')).toHaveAttribute('data-worker', 'ready');
    const typo = path.join(docs, 'no-such-file.md');
    expect(launchSecond(home, ['--', typo]).status).toBe(0);
    await expect(window.getByTestId('document-state')).toHaveAttribute('data-state', 'missing');
    expect(await paths(window)).toEqual([typo]);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('--profile with a new name creates it in its own window; Undo sends the files back and deletes it', async () => {
  const home = tempHome();
  const { app, window, close } = await launchApp(['--', basic], { home });
  try {
    await expect.poll(() => paths(window)).toEqual([basic]);
    const opened = app.waitForEvent('window');
    expect(launchSecond(home, ['--profile', 'Acme Corp', '--', gfm]).status).toBe(0);
    const created = await opened;
    await expect.poll(() => paths(created)).toEqual([gfm]);
    const profileDir = path.join(appDirs(home).config, 'profiles', 'acme-corp');
    expect(existsSync(path.join(profileDir, 'profile.json'))).toBe(true);
    // The first window is untouched.
    expect(await paths(window)).toEqual([basic]);

    const notice = created.getByTestId('profile-created');
    await expect(notice).toContainText("Created profile 'Acme Corp'");
    const gone = created.waitForEvent('close');
    await notice.getByRole('button', { name: 'Undo' }).click();
    await gone;
    await expect.poll(() => paths(window)).toEqual([basic, gfm]);
    expect(app.windows()).toHaveLength(1);
    await expect.poll(() => existsSync(profileDir)).toBe(false);
    expect(existsSync(path.join(appDirs(home).state, 'profiles', 'acme-corp'))).toBe(false);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('a profile name that looks like a path stays a profile folder under profiles/', async () => {
  const home = tempHome();
  const { app, window, close } = await launchApp([], { home });
  try {
    await expect(window.getByTestId('app-root')).toHaveAttribute('data-worker', 'ready');
    const opened = app.waitForEvent('window');
    expect(launchSecond(home, ['--profile', '../../escape', '--', basic]).status).toBe(0);
    await opened;
    const { config, state } = appDirs(home);
    await expect.poll(() => existsSync(path.join(config, 'profiles', 'escape', 'profile.json'))).toBe(true);
    expect(readdirSync(config).sort()).toEqual(['profiles']);
    expect(readdirSync(state).filter((name) => name.includes('escape'))).toEqual([]);
    expect(existsSync(path.join(home, 'escape'))).toBe(false);
  } finally {
    await close();
    removeTempHome(home);
  }
});
