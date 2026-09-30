import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { appDirs, launchApp, launchSecond, removeTempHome, tempHome } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const basic = path.join(docs, 'basic.md');
const gfm = path.join(docs, 'gfm.md');
const math = path.join(docs, 'math.md');
const frontmatter = path.join(docs, 'frontmatter.md');

const snapshot = (page: Page) => page.evaluate(() => window.galeo.tabs.snapshot());
const paths = async (page: Page) => (await snapshot(page)).tabs.map((tab) => tab.path);
/** The file the page itself shows (its selected tab's tooltip is the path), not only what main says. */
const shownPath = (page: Page) => page.getByRole('tab', { selected: true }).locator('.tab-label').getAttribute('title');

test('a later launch adds its files to the running window as tabs, shows the first, and exits', async () => {
  const home = tempHome();
  const { app, window, close } = await launchApp(['--', basic], { home });
  try {
    await expect.poll(() => paths(window)).toEqual([basic]);
    // The page shows its tab first, so what follows tests a window already showing one.
    await expect.poll(() => shownPath(window)).toBe(basic);
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
    await expect.poll(() => shownPath(window)).toBe(basic);
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
    // Its session goes after its settings.
    await expect.poll(() => existsSync(path.join(appDirs(home).state, 'profiles', 'acme-corp'))).toBe(false);
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
    // On macOS and Windows the state folder sits inside the config folder.
    expect(readdirSync(config).filter((name) => path.join(config, name) !== state)).toEqual(['profiles']);
    expect(readdirSync(state).filter((name) => name.includes('escape'))).toEqual([]);
    expect(existsSync(path.join(home, 'escape'))).toBe(false);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('relative paths resolve against the directory each launch ran in', async () => {
  const home = tempHome();
  // The first launch runs in the repository root.
  const { window, close } = await launchApp(['--', path.relative(path.resolve(import.meta.dirname, '../..'), basic)], { home });
  try {
    await expect.poll(() => paths(window)).toEqual([basic]);
    expect(launchSecond(home, ['--', 'gfm.md'], { cwd: docs }).status).toBe(0);
    await expect.poll(() => paths(window)).toEqual([basic, gfm]);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('--profile of a running profile adds to its window, whichever window was focused last', async () => {
  const home = tempHome();
  const { app, window, close } = await launchApp(['--', basic], { home });
  try {
    const opened = app.waitForEvent('window');
    expect(launchSecond(home, ['--profile', 'Work', '--', gfm]).status).toBe(0);
    const work = await opened;
    await expect.poll(() => paths(work)).toEqual([gfm]);
    expect(launchSecond(home, ['--profile', 'work', '--', math]).status).toBe(0);
    await expect.poll(() => paths(work)).toEqual([gfm, math]);
    expect(await paths(window)).toEqual([basic]);
    // --profile default reaches the other profile's window, although work's was focused last.
    expect(launchSecond(home, ['--profile', 'default', '--', frontmatter]).status).toBe(0);
    await expect.poll(() => paths(window)).toEqual([basic, frontmatter]);
    expect(await paths(work)).toEqual([gfm, math]);
    expect(app.windows()).toHaveLength(2);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('--new-window opens a new window in the target profile, with the files', async () => {
  const home = tempHome();
  const { app, window, close } = await launchApp(['--', basic], { home });
  try {
    await expect.poll(() => paths(window)).toEqual([basic]);
    const opened = app.waitForEvent('window');
    expect(launchSecond(home, ['--new-window', '--', gfm, math]).status).toBe(0);
    const second = await opened;
    await expect.poll(() => paths(second)).toEqual([gfm, math]);
    await expect(second.getByTestId('profile-chip')).toHaveAccessibleName('Profile: default');
    expect(await paths(window)).toEqual([basic]);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('a launch without files opens nothing new: it asks for the running window', async () => {
  const home = tempHome();
  const { app, window, close } = await launchApp(['--', basic], { home });
  try {
    await expect.poll(() => paths(window)).toEqual([basic]);
    for (const args of [[], ['--']]) expect(launchSecond(home, args).status).toBe(0);
    // Both requests are handled in order; a later one proves the earlier ones are done.
    expect(launchSecond(home, ['--', gfm]).status).toBe(0);
    await expect.poll(() => paths(window)).toEqual([basic, gfm]);
    expect(app.windows()).toHaveLength(1);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('files added to a window that is not focused make it ask for attention, without raising it', async () => {
  const home = tempHome();
  const { app, window, close } = await launchApp(['--', basic], { home });
  try {
    await expect.poll(() => shownPath(window)).toBe(basic);
    const attention = () => app.evaluate(() => (globalThis as { __galeoAttention?: number[] }).__galeoAttention?.length ?? 0);
    // Focused: nothing to ask for.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.focus());
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFocused())).toBe(true);
    expect(launchSecond(home, ['--', gfm]).status).toBe(0);
    await expect.poll(() => paths(window)).toEqual([basic, gfm]);
    expect(await attention()).toBe(0);
    // Elsewhere (another workspace): the files arrive and the window asks, once.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.blur());
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFocused())).toBe(false);
    expect(launchSecond(home, ['--', math]).status).toBe(0);
    await expect.poll(() => paths(window)).toEqual([basic, gfm, math]);
    expect(await attention()).toBe(1);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFocused())).toBe(false);
  } finally {
    await close();
    removeTempHome(home);
  }
});
