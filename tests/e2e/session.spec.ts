import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { appDirs, launchApp, removeTempHome, tempHome } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const plan = path.join(docs, 'plan-50k.md');
const basic = path.join(docs, 'basic.md');
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const selected = (window: Page) => window.getByRole('tab', { selected: true });
const stateFile = (home: string, name: string) => path.join(appDirs(home).state, 'profiles', 'default', name);

/** Waits until the session on disk names every path (the 2 s save after the last change). */
async function sessionNames(home: string, paths: string[]) {
  const names = () => {
    const file = stateFile(home, 'session.json');
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    return paths.every((each) => text.includes(JSON.stringify(each)));
  };
  await expect.poll(names, { timeout: 15_000 }).toBe(true);
}

async function withHome(run: (home: string) => Promise<void>) {
  const home = tempHome();
  try {
    await run(home);
  } finally {
    removeTempHome(home);
  }
}

test('a restart brings the tabs back hibernated, the shown one first, each where the reader left it', async () => {
  await withHome(async (home) => {
    const first = await launchApp(['--', plan, basic], { home });
    let left = 0;
    try {
      const view = shownDocument(first.window);
      await expect(view.locator('h2').nth(3)).toBeVisible();
      await view.evaluate((element) => (element.scrollTop = element.scrollHeight * 0.5));
      await expect(view).toHaveAttribute('data-position-line', /\d+/);
      left = await view.evaluate((element) => element.scrollTop);
      await first.window.keyboard.press('Control+Tab');
      await expect(selected(first.window)).toContainText('basic.md');
    } finally {
      await first.close();
    }

    const second = await launchApp([], { home });
    try {
      await expect(second.window.getByRole('tab')).toHaveCount(2);
      await expect(selected(second.window)).toContainText('basic.md');
      await expect(shownDocument(second.window)).toBeVisible();
      await expect(second.window.getByTestId('document')).toHaveCount(1);
      await second.window.keyboard.press('Control+Tab');
      const view = shownDocument(second.window);
      await expect(view.locator('h2').first()).toBeAttached();
      await expect(view).not.toHaveAttribute('data-waking');
      expect(Math.abs((await view.evaluate((element) => element.scrollTop)) - left)).toBeLessThanOrEqual(2);
    } finally {
      await second.close();
    }
  });
});

test('closing the last window keeps its tabs for next time', async () => {
  await withHome(async (home) => {
    const first = await launchApp(['--', plan, basic], { home });
    await expect(shownDocument(first.window)).toBeVisible();
    const exited = new Promise((resolve) => first.app.process().once('exit', resolve));
    await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    // macOS keeps an app running without windows; quitting then must still save what the window held.
    if (process.platform === 'darwin') await first.app.evaluate(({ app }) => app.quit()).catch(() => undefined);
    await exited;
    const second = await launchApp([], { home });
    try {
      await expect(second.window.getByRole('tab')).toHaveText(['plan-50k.md✕', 'basic.md✕']);
    } finally {
      await second.close();
    }
  });
});

test('quitting at the sandbox prompt keeps the last session, and its snapshots', async () => {
  await withHome(async (home) => {
    const first = await launchApp(['--', plan, basic], { home });
    await expect(shownDocument(first.window)).toBeVisible();
    await first.close();

    const prompt = await launchApp(['--no-sandbox', '--galeo-sandbox-unavailable=apparmor-userns'], { home });
    const exited = new Promise((resolve) => prompt.app.process().once('exit', resolve));
    await prompt.window.getByRole('button', { name: 'Quit' }).click();
    await exited;
    await prompt.close().catch(() => undefined);
    expect(existsSync(stateFile(home, 'session.json.1'))).toBe(false);

    const again = await launchApp([], { home });
    try {
      await expect(again.window.getByRole('tab')).toHaveText(['plan-50k.md✕', 'basic.md✕']);
    } finally {
      await again.close();
    }
  });
});

test('after kill -9 the session is the last one saved, whole', async () => {
  await withHome(async (home) => {
    const first = await launchApp(['--', plan, basic], { home });
    await sessionNames(home, [plan, basic]);
    const exited = new Promise((resolve) => first.app.process().once('exit', resolve));
    // No save on quit: the whole app dies at once. On Windows, killing main alone leaves its child
    // processes running (holding the test home's files), so the tree goes.
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(first.app.process().pid), '/T', '/F']);
    else first.app.process().kill('SIGKILL');
    await exited;
    const second = await launchApp([], { home });
    try {
      await expect(second.window.getByRole('tab')).toHaveText(['plan-50k.md✕', 'basic.md✕']);
      await expect(shownDocument(second.window)).toBeVisible();
    } finally {
      await second.close();
    }
  });
});

function previousSessions(page: Page) {
  return page.evaluate(() => window.galeo.session.previous());
}

test("Restore previous session brings back the last run's tabs in a new window", async () => {
  await withHome(async (home) => {
    const first = await launchApp(['--', plan], { home });
    await expect(shownDocument(first.window)).toBeVisible();
    await first.close();

    const second = await launchApp(['--', basic], { home });
    try {
      await expect(second.window.getByRole('tab')).toHaveCount(2);
      await second.window.getByRole('tab').filter({ hasText: 'plan-50k.md' }).click();
      await second.window.keyboard.press('ControlOrMeta+W');
      await expect(second.window.getByRole('tab')).toHaveCount(1);
    } finally {
      await second.close();
    }

    const third = await launchApp([], { home });
    try {
      await expect(third.window.getByRole('tab')).toHaveText(['basic.md✕']);
      // The run just restored is the current session; the one before it is the first snapshot.
      const previous = await previousSessions(third.window);
      expect(previous.map((each) => ({ snapshot: each.snapshot, windows: each.windows, tabs: each.tabs }))).toEqual([
        { snapshot: 1, windows: 1, tabs: 1 },
      ]);
      await third.window.evaluate(() => window.galeo.session.restorePrevious(1));
      const restored = await third.app.waitForEvent('window');
      await expect(restored.getByRole('tab')).toHaveText(['plan-50k.md✕']);
    } finally {
      await third.close();
    }
  });
});

test('a deleted file comes back as missing, and recovers once it is there again', async () => {
  await withHome(async (home) => {
    const file = path.join(home, 'notes.md');
    writeFileSync(file, '# Notes\n');
    const first = await launchApp(['--', file], { home });
    await expect(shownDocument(first.window).locator('h1')).toHaveText('Notes');
    await first.close();
    unlinkSync(file);

    const second = await launchApp([], { home });
    try {
      await expect(second.window.getByTestId('document-state')).toContainText('File not found');
      await expect(second.window.getByRole('tab', { name: /notes\.md.*file missing/ })).toBeVisible();
      writeFileSync(file, '# Notes, back\n');
      await second.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.emit('focus'));
      await expect(shownDocument(second.window).locator('h1')).toHaveText('Notes, back');
    } finally {
      await second.close();
    }
  });
});

test('session and recent files are owner-only and hold no document text (SR-16)', async () => {
  test.skip(process.platform === 'win32', 'POSIX modes');
  await withHome(async (home) => {
    const app = await launchApp(['--', basic], { home });
    try {
      await sessionNames(home, [basic]);
    } finally {
      await app.close();
    }
    const fixtureSentence = 'A paragraph with';
    expect(readFileSync(basic, 'utf8')).toContain(fixtureSentence);
    for (const name of ['session.json', 'recent.json']) {
      expect(statSync(stateFile(home, name)).mode & 0o777, name).toBe(0o600);
      expect(readFileSync(stateFile(home, name), 'utf8'), name).not.toContain(fixtureSentence);
    }
    expect(statSync(path.dirname(stateFile(home, 'session.json'))).mode & 0o777).toBe(0o700);
  });
});
