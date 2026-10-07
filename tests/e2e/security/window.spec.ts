import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import electronBinary from 'electron';
import { launchApp, launchSecond } from '../../helpers/launch';

test.describe('hardened windows (SR-01)', () => {
  test('renderers run sandboxed, with no Node in the page', async () => {
    const { app, window: page, close } = await launchApp();
    try {
      await expect(page.getByTestId('app-root')).toHaveAttribute('data-worker', 'ready');
      expect(await page.evaluate(() => [typeof require, typeof process, typeof module])).toEqual([
        'undefined',
        'undefined',
        'undefined',
      ]);
      const renderers = await app.evaluate(({ app: electronApp }) =>
        electronApp.getAppMetrics().filter((m) => m.type === 'Tab'),
      );
      expect(renderers.length).toBeGreaterThan(0);
      for (const renderer of renderers) {
        if (process.platform === 'linux') {
          // Chromium's Linux sandbox confines renderers with a seccomp-BPF filter.
          expect(readFileSync(`/proc/${renderer.pid}/status`, 'utf8')).toMatch(/^Seccomp:\s+2$/m);
        } else {
          expect(renderer.sandboxed).toBe(true);
        }
      }
    } finally {
      await close();
    }
  });

  test('top-level navigation is refused', async () => {
    const { app, window: page, close } = await launchApp();
    try {
      // The listener must exist in main before the page navigates, so register it first.
      await app.evaluate(({ BrowserWindow }) => {
        (globalThis as { __galeoNavigation?: Promise<string> }).__galeoNavigation = new Promise((resolve) => {
          BrowserWindow.getAllWindows()[0]!.webContents.once('will-navigate', (_event, url) => resolve(url));
        });
      });
      await page.evaluate(() => {
        location.href = 'https://example.com/';
      });
      expect(await app.evaluate(() => (globalThis as { __galeoNavigation?: Promise<string> }).__galeoNavigation)).toBe(
        'https://example.com/',
      );
      expect(await page.evaluate(() => location.href)).toBe('galeo://app/index.html');
    } finally {
      await close();
    }
  });

  test('popups are refused', async () => {
    const { app, window: page, close } = await launchApp();
    try {
      const opened = await page.evaluate(() => [
        window.open('https://example.com/') === null,
        window.open('galeo://app/index.html') === null,
      ]);
      expect(opened).toEqual([true, true]);
      expect(app.windows()).toHaveLength(1);
    } finally {
      await close();
    }
  });

  test('permission requests are denied', async () => {
    const { window: page, close } = await launchApp();
    try {
      expect(await page.evaluate(() => Notification.requestPermission())).toBe('denied');
      const geolocation = await page.evaluate(
        () =>
          new Promise<number>((resolve) =>
            navigator.geolocation.getCurrentPosition(
              () => resolve(0),
              (error) => resolve(error.code),
            ),
          ),
      );
      expect(geolocation).toBe(1); // PERMISSION_DENIED
    } finally {
      await close();
    }
  });

  test('copy buttons can write to the clipboard', async () => {
    const { app, window: page, close } = await launchApp();
    try {
      await page.evaluate(() => navigator.clipboard.writeText('copied by galeo'));
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('copied by galeo');
    } finally {
      await close();
    }
  });
});

test.describe('sandbox state', () => {
  test('a sandboxed launch shows no warning', async () => {
    const { app, window: page, close } = await launchApp();
    try {
      await expect(page.getByTestId('app-root')).toHaveAttribute('data-worker', 'ready');
      await expect(page.getByTestId('unsandboxed-badge')).toHaveCount(0);
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getTitle())).toBe(
        'default — galeo',
      );
    } finally {
      await close();
    }
  });

  test('--no-sandbox in a later launch leaves the running instance sandboxed (SR-01)', async () => {
    const { app, window: page, home, close } = await launchApp();
    try {
      await expect(page.getByTestId('app-root')).toHaveAttribute('data-worker', 'ready');
      const opened = app.waitForEvent('window');
      expect(launchSecond(home, ['--no-sandbox', '--new-window', '--', path.join(home, 'notes.md')]).status).toBe(0);
      const second = await opened;
      await expect(second.getByRole('tab')).toHaveCount(1);
      for (const window of [page, second]) await expect(window.getByTestId('unsandboxed-badge')).toHaveCount(0);
      // The running instance's own switches decide its windows' sandbox; the forwarded one is data.
      expect(await app.evaluate(({ app }) => app.commandLine.hasSwitch('no-sandbox'))).toBe(false);
      const titles = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => window.getTitle()));
      expect(titles).toHaveLength(2);
      for (const title of titles) expect(title).not.toContain('unsandboxed');
    } finally {
      await close();
    }
  });

  test('--no-sandbox marks the window with a badge and a title suffix', async () => {
    const { app, window: page, close } = await launchApp(['--no-sandbox']);
    try {
      await expect(page.getByTestId('unsandboxed-badge')).toBeVisible();
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getTitle())).toBe(
        'default — galeo — unsandboxed',
      );
    } finally {
      await close();
    }
  });

  test('main refuses the sandbox choice when it was not offered', async () => {
    const { window: page, close } = await launchApp();
    try {
      const result = await page.evaluate(() =>
        window.galeo.app.resolveSandboxUnavailable('quit').then(
          () => 'resolved',
          (error: unknown) => String(error),
        ),
      );
      expect(result).toContain('not offered');
    } finally {
      await close();
    }
  });
});

test.describe('sandbox unavailable (launcher wrapper relaunch)', () => {
  const relaunch = ['--no-sandbox', '--galeo-sandbox-unavailable=apparmor-userns'];

  test('shows only the choice, with Quit focused', async () => {
    const { window: page, close } = await launchApp(relaunch);
    try {
      await expect(page.getByRole('heading', { name: "galeo can't start its security sandbox" })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Quit' })).toBeFocused();
      await expect(page.getByTestId('app-root')).toHaveCount(0);
    } finally {
      await close();
    }
  });

  test('Run without sandbox continues with the warning', async () => {
    const { app, window: choice, close } = await launchApp(relaunch);
    try {
      const next = app.waitForEvent('window');
      await choice.getByRole('button', { name: 'Run without sandbox' }).click();
      const main = await next;
      await expect(main.getByTestId('unsandboxed-badge')).toBeVisible();
      await expect.poll(() => app.windows().length).toBe(1);
    } finally {
      await close();
    }
  });

  test('Quit exits the app', async () => {
    const { app, window: page, close } = await launchApp(relaunch);
    const exited = new Promise<void>((resolve) => app.process().once('exit', () => resolve()));
    await page.getByRole('button', { name: 'Quit' }).click();
    await exited;
    await close().catch(() => undefined);
  });
});

test('unknown launch options exit with status 2 and say why', () => {
  const root = path.resolve(import.meta.dirname, '../../..');
  const result = spawnSync(electronBinary as unknown as string, ['.', '--bogus'], { cwd: root, encoding: 'utf8' });
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('unknown option: --bogus');
});

test.describe('Trusted Types (ADR-010)', () => {
  const fixture = (name: string) => path.resolve(import.meta.dirname, '../../fixtures/docs', name);

  test('the page refuses HTML no policy made, and only the allowed policies can be created', async () => {
    const { window: page, close } = await launchApp();
    try {
      await expect(page.getByTestId('app-root')).toHaveAttribute('data-worker', 'ready');
      const outcomes = await page.evaluate(() => {
        const attempt = (action: () => void) => {
          try {
            action();
            return 'allowed';
          } catch {
            return 'refused';
          }
        };
        const element = document.createElement('div');
        return {
          markup: attempt(() => (element.innerHTML = '<img src=x>')),
          text: attempt(() => (element.innerHTML = 'plain text')),
          policy: attempt(() => (globalThis as unknown as { trustedTypes: { createPolicy(name: string, rules: object): unknown } }).trustedTypes.createPolicy('mine', {})),
        };
      });
      expect(outcomes).toEqual({ markup: 'refused', text: 'allowed', policy: 'refused' });
    } finally {
      await close();
    }
  });

  test('documents, diagrams and their viewer, math, logs, source and the overlays render with no violation', async () => {
    const { window, close } = await launchApp(['--', fixture('mermaid.md'), fixture('math.md'), fixture('sample.log'), fixture('gfm.md')]);
    const violations: string[] = [];
    window.on('console', (message) => {
      if (/Trusted|trusted-types|require-trusted-types/.test(message.text())) violations.push(message.text());
    });
    try {
      const shown = window.locator('[data-testid="tab-panel"][data-active="true"]');
      const diagrams = shown.locator('.galeo-diagram');
      await expect(diagrams.first()).toHaveAttribute('data-state', 'rendered');
      for (const diagram of await diagrams.all()) {
        await diagram.scrollIntoViewIfNeeded();
        await expect(diagram).not.toHaveAttribute('data-state', 'pending');
      }
      // The diagram viewer inserts the same SVG into a shadow root of its own.
      await diagrams.first().scrollIntoViewIfNeeded();
      await diagrams.first().getByRole('button', { name: 'Expand diagram' }).click();
      await expect(window.getByTestId('zoom-stage').locator('.galeo-viewer-content')).toBeVisible();
      await window.keyboard.press('Escape');
      const show = (name: RegExp) => window.getByRole('tab', { name }).click();
      await show(/math\.md/);
      await expect(shown.getByTestId('document').locator('.katex').first()).toBeVisible();
      await show(/sample\.log/);
      await expect(shown.getByTestId('document').locator('.cm-editor')).toBeVisible();
      await show(/gfm\.md/);
      await expect(shown.getByTestId('document').locator('article table').first()).toBeVisible();
      await window.keyboard.press('ControlOrMeta+U');
      await expect(shown.getByTestId('document').locator('.cm-editor')).toBeVisible();
      await window.keyboard.press('ControlOrMeta+P');
      await expect(window.getByTestId('quick-open')).toBeVisible();
      await window.keyboard.press('Escape');
      await window.keyboard.press('ControlOrMeta+Shift+P');
      await window.keyboard.press('Escape');
      expect(violations).toEqual([]);
    } finally {
      await close();
    }
  });
});
