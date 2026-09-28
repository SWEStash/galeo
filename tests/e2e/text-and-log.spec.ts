import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from '../helpers/launch';

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
