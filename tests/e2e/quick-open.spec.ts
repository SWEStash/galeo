import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';

const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const quickOpen = (window: Page) => window.getByTestId('quick-open');
const field = (window: Page) => quickOpen(window).getByRole('combobox');
const option = (window: Page, name: string | RegExp) => quickOpen(window).getByRole('option', { name });

/** A repository as an agent leaves it: plans in a dot folder, dependencies to skip. */
function repository(home: string): string {
  const root = path.join(home, 'acme');
  const files: Record<string, string> = {
    '.git/HEAD': 'ref: refs/heads/main\n',
    'README.md': '# Acme\n',
    '.local/plans/plan.md': '# The plan\n',
    'docs/notes.md': '# Notes\n',
    'node_modules/dep/plan.md': '# Not this one\n',
  };
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  }
  return root;
}

async function withRepository(run: (root: string, home: string) => Promise<void>) {
  const home = tempHome();
  try {
    await run(repository(home), home);
  } finally {
    removeTempHome(home);
  }
}

test('Ctrl+P lists the open tabs at once, passes axe, and Esc gives focus back to the document', async () => {
  await withRepository(async (root, home) => {
    const { window, close } = await launchApp(['--', path.join(root, 'README.md')], { home });
    try {
      await expect(shownDocument(window).locator('h1')).toHaveText('Acme');
      await window.keyboard.press('ControlOrMeta+P');
      await expect(field(window)).toBeFocused();
      await expect(quickOpen(window).getByRole('group', { name: /Open tabs/ })).toBeVisible();
      await expect(option(window, /README\.md/)).toBeVisible();
      const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="quick-open"]').analyze();
      expect(results.violations).toEqual([]);
      await window.keyboard.press('Escape');
      await expect(quickOpen(window)).toHaveCount(0);
      await expect(shownDocument(window)).toBeFocused();
    } finally {
      await close();
    }
  });
});

test('the repository streams in, dot folders included and dependencies left out, and choosing one opens it', async () => {
  await withRepository(async (root, home) => {
    const { window, close } = await launchApp(['--', path.join(root, 'docs', 'notes.md')], { home });
    try {
      await expect(shownDocument(window).locator('h1')).toHaveText('Notes');
      await window.keyboard.press('ControlOrMeta+P');
      await field(window).fill('plan');
      const repo = quickOpen(window).getByRole('group', { name: /In acme \(git root\)/ });
      await expect(repo.getByRole('option', { name: /\.local\/plans\/plan\.md/ })).toBeVisible();
      await expect(repo.getByRole('option', { name: /node_modules/ })).toHaveCount(0);
      await expect(repo.getByRole('option')).toHaveCount(1);
      // Tabs and recent files match their whole path, so the temp folder's letters may add some.
      await expect(window.getByTestId('quick-open-count')).toHaveText(/^\d+ results?$/);
      await repo.getByRole('option', { name: /\.local\/plans\/plan\.md/ }).click();
      await expect(quickOpen(window)).toHaveCount(0);
      await expect(window.getByRole('tab', { selected: true })).toContainText('plan.md');
      await expect(shownDocument(window).locator('h1')).toHaveText('The plan');
    } finally {
      await close();
    }
  });
});

test('a file already open is shown, not opened again', async () => {
  await withRepository(async (root, home) => {
    const { window, close } = await launchApp(['--', path.join(root, 'README.md'), path.join(root, 'docs', 'notes.md')], { home });
    try {
      await expect(window.getByRole('tab')).toHaveCount(2);
      await expect(window.getByRole('tab', { selected: true })).toContainText('README.md');
      await window.keyboard.press('ControlOrMeta+P');
      await field(window).fill('notes');
      await expect(option(window, /notes\.md/)).toBeVisible();
      await window.keyboard.press('Enter');
      await expect(window.getByRole('tab', { selected: true })).toContainText('notes.md');
      await expect(window.getByRole('tab')).toHaveCount(2);
    } finally {
      await close();
    }
  });
});

test('Home and End move the caret in the field; the arrows still choose the result', async () => {
  await withRepository(async (root, home) => {
    const { window, close } = await launchApp(['--', path.join(root, 'README.md'), path.join(root, 'docs', 'notes.md')], { home });
    try {
      await expect(window.getByRole('tab')).toHaveCount(2);
      await window.keyboard.press('ControlOrMeta+P');
      await field(window).fill('notes');
      await expect(option(window, /notes\.md/)).toBeVisible();
      await window.keyboard.press('ArrowDown');
      await expect(field(window)).toHaveAttribute('aria-activedescendant', /.+/);
      const highlighted = await field(window).getAttribute('aria-activedescendant');
      const caret = () => field(window).evaluate((input: HTMLInputElement) => input.selectionStart);
      await window.keyboard.press('Home');
      expect(await caret()).toBe(0);
      await window.keyboard.press('End');
      expect(await caret()).toBe('notes'.length);
      await expect(field(window)).toHaveAttribute('aria-activedescendant', highlighted!);
      await window.keyboard.press('Enter');
      await expect(window.getByRole('tab', { selected: true })).toContainText('notes.md');
    } finally {
      await close();
    }
  });
});

test('Tab fills the field with the highlighted path and Enter opens it; the fill icon does the same with the mouse', async () => {
  await withRepository(async (root, home) => {
    const { window, close } = await launchApp(['--', path.join(root, 'README.md')], { home });
    try {
      await expect(shownDocument(window).locator('h1')).toHaveText('Acme');
      await window.keyboard.press('ControlOrMeta+P');
      await field(window).fill('plan');
      const plan = option(window, /\.local\/plans\/plan\.md/);
      await expect(plan).toBeVisible();
      await field(window).press('ArrowDown');
      await expect(plan).toHaveAttribute('data-focused', 'true');
      await expect(plan.locator('.quick-open-fill')).toBeVisible();
      const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="quick-open"]').analyze();
      expect(results.violations).toEqual([]);
      await field(window).press('Tab');
      // The test's home isn't the app's home folder, so the path shows whole.
      await expect(field(window)).toHaveValue(path.join(root, '.local', 'plans', 'plan.md'));
      await expect(field(window)).toBeFocused();
      await expect(window.getByRole('tab')).toHaveCount(1);
      await expect(option(window, /^plan\.md/)).toBeVisible();
      await window.keyboard.press('Enter');
      await expect(shownDocument(window).locator('h1')).toHaveText('The plan');

      await window.keyboard.press('ControlOrMeta+P');
      await field(window).fill('notes');
      const notes = option(window, /notes\.md/);
      await notes.hover();
      await notes.locator('.quick-open-fill').click();
      await expect(field(window)).toHaveValue(path.join(root, 'docs', 'notes.md'));
      await expect(quickOpen(window)).toBeVisible();
      await expect(window.getByRole('tab')).toHaveCount(2);
    } finally {
      await close();
    }
  });
});

test('Enter right after the arrows opens the result they highlighted', async () => {
  await withRepository(async (root, home) => {
    const { window, close } = await launchApp(['--', path.join(root, 'README.md'), path.join(root, 'docs', 'notes.md')], { home });
    try {
      await expect(window.getByRole('tab')).toHaveCount(2);
      await window.keyboard.press('ControlOrMeta+1');
      await window.keyboard.press('ControlOrMeta+P');
      await expect(quickOpen(window).getByRole('group', { name: /Open tabs/ }).getByRole('option')).toHaveCount(2);
      await window.keyboard.press('ArrowDown');
      await window.keyboard.press('ArrowDown');
      await window.keyboard.press('Enter');
      await expect(quickOpen(window)).toHaveCount(0);
      await expect(window.getByRole('tab', { selected: true })).toContainText('notes.md');
    } finally {
      await close();
    }
  });
});

test('Ctrl+Enter opens the file in a new window of the profile', async () => {
  await withRepository(async (root, home) => {
    const { app, window, close } = await launchApp(['--', path.join(root, 'README.md')], { home });
    try {
      await expect(shownDocument(window).locator('h1')).toHaveText('Acme');
      await window.keyboard.press('ControlOrMeta+P');
      await field(window).fill('.local/plan');
      await expect(option(window, /\.local\/plans\/plan\.md/)).toBeVisible();
      const opened = app.waitForEvent('window');
      await window.keyboard.press('ControlOrMeta+Enter');
      const second = await opened;
      await expect(shownDocument(second).locator('h1')).toHaveText('The plan');
      await expect(window.getByRole('tab')).toHaveCount(1);
    } finally {
      await close();
    }
  });
});

test('a typed folder path lists its files and folders; choosing a folder goes into it', async () => {
  await withRepository(async (root, home) => {
    const { window, close } = await launchApp(['--', path.join(root, 'README.md')], { home });
    try {
      await window.getByTestId('tab-new').click();
      await expect(field(window)).toBeFocused();
      // Typed, not filled in: main lists a typed folder only for real key presses (T6).
      await field(window).pressSequentially(`${root}/`);
      await expect(option(window, 'docs/')).toBeVisible();
      await expect(option(window, '.local/')).toBeVisible();
      await field(window).pressSequentially('do');
      await expect(option(window, 'docs/')).toBeVisible();
      await window.keyboard.press('Enter');
      await expect(field(window)).toHaveValue(`${root}/docs/`);
      await expect(option(window, 'notes.md')).toBeVisible();
      await window.keyboard.press('Enter');
      await expect(shownDocument(window).locator('h1')).toHaveText('Notes');
    } finally {
      await close();
    }
  });
});

test('no matches names what was searched and how to open any path', async () => {
  await withRepository(async (root, home) => {
    const { window, close } = await launchApp(['--', path.join(root, 'README.md')], { home });
    try {
      await expect(shownDocument(window).locator('h1')).toHaveText('Acme');
      await window.keyboard.press('ControlOrMeta+P');
      await field(window).fill('zzqqxx');
      await expect(window.getByTestId('quick-open-empty')).toHaveText('No matches in acme (git root). Type ~/… or /… to open any path.');
    } finally {
      await close();
    }
  });
});

test('main opens only what it offered this window, and nothing once quick open closed (SR-12)', async () => {
  await withRepository(async (root, home) => {
    const { window: page, close } = await launchApp(['--', path.join(root, 'README.md')], { home });
    try {
      await expect(shownDocument(page).locator('h1')).toHaveText('Acme');
      const refused = await page.evaluate(async (secret) => {
        const api = window.galeo.quickOpen;
        const { token } = await api.start();
        const results = await api.query(token, 'readme');
        const offered = results.sections[0]!.entries[0]!.id;
        const forged = await api.open(token, secret, false).then(() => 'opened', () => 'refused');
        // Offered, but asked for without the reader pressing anything (T6).
        const unasked = await api.open(token, offered, false).then(() => 'opened', () => 'refused');
        const listed = (await api.query(token, '/etc/')).sections.length;
        await api.close(token);
        const stale = await api.open(token, offered, false).then(() => 'opened', () => 'refused');
        return [forged, unasked, listed, stale];
      }, '/etc/passwd');
      expect(refused).toEqual(['refused', 'refused', 0, 'refused']);
      await expect(page.getByRole('tab')).toHaveCount(1);
    } finally {
      await close();
    }
  });
});

test('a choice main refuses says so in the status bar, and opens nothing', async () => {
  await withRepository(async (root, home) => {
    const { window: page, close } = await launchApp(['--', path.join(root, 'README.md')], { home });
    try {
      await expect(shownDocument(page).locator('h1')).toHaveText('Acme');
      await page.keyboard.press('ControlOrMeta+P');
      await field(page).fill('notes');
      // Chosen, not only listed: a slow machine may still show the unfiltered list first.
      await expect(option(page, /notes\.md/)).toHaveAttribute('data-focused', 'true');
      // Another session for this window ends the one on screen: main no longer offers its results (the race).
      await page.evaluate(async () => {
        const { token } = await window.galeo.quickOpen.start();
        await window.galeo.quickOpen.close(token);
      });
      await page.keyboard.press('Enter');
      await expect(quickOpen(page)).toHaveCount(0);
      await expect(page.getByTestId('status-message')).toHaveText("Couldn't open docs/notes.md");
      await expect(page.getByRole('tab')).toHaveCount(1);
    } finally {
      await close();
    }
  });
});
