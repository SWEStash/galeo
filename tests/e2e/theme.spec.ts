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
    // The fonts are declared by the app's stylesheet; the page's script, which renders the app root,
    // runs only once that stylesheet has loaded.
    await expect(window.getByTestId('app-root')).toBeVisible();
    // `fonts.load` can resolve with nothing loaded while the font rules aren't registered yet (seen on
    // Windows CI), so it's asked again until every family is in. Every face's status is reported, so a
    // family that never loads shows why.
    await expect
      .poll(() =>
        window.evaluate(async () => {
          await Promise.all(['Inter', 'Source Serif 4', 'JetBrains Mono'].map((family) => document.fonts.load(`16px "${family}"`)));
          const faces = [...document.fonts].map((face) => ({ family: face.family.replaceAll('"', ''), style: face.style, status: face.status }));
          return { loaded: [...new Set(faces.filter((face) => face.status === 'loaded').map((face) => face.family))].sort(), faces };
        }),
      )
      .toMatchObject({ loaded: ['Inter', 'JetBrains Mono', 'Source Serif 4'] });
  } finally {
    await close();
  }
});
