import { expect, test } from '@playwright/test';
import { launchApp } from '../helpers/launch';

test('the colour scheme follows the system theme live, without a reload', async () => {
  const { app, window, close } = await launchApp();
  try {
    const root = window.locator('html');
    await app.evaluate(({ nativeTheme }) => (nativeTheme.themeSource = 'dark'));
    await expect(root).toHaveAttribute('data-scheme', 'dark');
    await expect(window.locator('body')).toHaveCSS('background-color', 'rgb(13, 17, 23)');
    await app.evaluate(({ nativeTheme }) => (nativeTheme.themeSource = 'light'));
    await expect(root).toHaveAttribute('data-scheme', 'light');
    expect(await window.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1);
  } finally {
    await close();
  }
});

test('the vendored fonts load from the app itself', async () => {
  const { window, close } = await launchApp();
  try {
    const loaded = await window.evaluate(async () => {
      await Promise.all(['Inter', 'Source Serif 4', 'JetBrains Mono'].map((family) => document.fonts.load(`16px "${family}"`)));
      return [...document.fonts].filter((face) => face.status === 'loaded').map((face) => face.family.replaceAll('"', ''));
    });
    expect(new Set(loaded)).toEqual(new Set(['Inter', 'Source Serif 4', 'JetBrains Mono']));
  } finally {
    await close();
  }
});
