import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';
import { tokenColour } from '../helpers/token-colour';

const fixture = (name: string) => path.resolve(import.meta.dirname, '../fixtures/docs', name);

test('.txt opens in the reader view, with its source on Ctrl+U', async () => {
  const { window, close } = await launchApp(['--', fixture('notes.txt')]);
  try {
    const document = window.getByTestId('document');
    const paragraphs = document.locator('article.galeo-text-reader p');
    await expect(paragraphs).toHaveCount(2);
    await expect(paragraphs.first()).toHaveText('Plain notes, kept as written.\nA second line of the same paragraph.');
    await expect(paragraphs.nth(1)).toHaveText('A new paragraph <b>not markup</b>.');
    await window.keyboard.press('ControlOrMeta+U');
    await expect(document.locator('.cm-editor')).toBeVisible();
  } finally {
    await close();
  }
});

test('a log shows level badges and follows its end on End until scrolled up', async () => {
  const { window, close } = await launchApp(['--', fixture('sample.log')]);
  try {
    const document = window.getByTestId('document');
    await expect(document.locator('.galeo-log-badge-error').first()).toHaveText('ERR');
    await expect(document.locator('.galeo-log-badge-warn').first()).toHaveText('WRN');
    await expect(document).toHaveAttribute('data-follow', 'off');

    await window.keyboard.press('End');
    await expect(document).toHaveAttribute('data-follow', 'on');
    await expect(document.locator('.cm-line', { hasText: 'last line of the sample' })).toBeInViewport();

    await document.locator('.cm-scroller').hover();
    await window.mouse.wheel(0, -400);
    await expect(document).toHaveAttribute('data-follow', 'off');
  } finally {
    await close();
  }
});

for (const scheme of ['light', 'dark'] as const) {
  test(`a log line's timestamp, level word and keys take their colours, the text unchanged (${scheme})`, async () => {
    const home = tempHome();
    const file = path.join(home, 'service.log');
    const line = '2026-10-26T12:00:01Z ERROR worker failed code=7 retry=false';
    writeFileSync(file, `${line}\n`);
    const { app, window, close } = await launchApp(['--', file], { home });
    try {
      await app.evaluate(({ nativeTheme }, value) => (nativeTheme.themeSource = value), scheme);
      await expect(window.locator('html')).toHaveAttribute('data-scheme', scheme);
      const document = window.getByTestId('document');
      await expect(document.locator('.cm-line').first()).toHaveText(line);
      await expect(document.locator('.galeo-log-badge-error').first()).toHaveText('ERR');
      for (const [part, text, token] of [
        ['.galeo-log-time', '2026-10-26T12:00:01Z', '--galeo-color-muted'],
        ['.galeo-log-word-error', 'ERROR', '--galeo-color-log-error'],
        ['.galeo-log-key', 'code', '--galeo-syntax-constant'],
      ] as const) {
        const span = document.locator(part).first();
        await expect(span).toHaveText(text);
        const colours = await tokenColour(span, token);
        expect(colours.shown, part).toBe(colours.token);
        expect(colours.token, `${token} differs from the line's text`).not.toBe(colours.around);
      }
    } finally {
      await close();
      removeTempHome(home);
    }
  });
}
