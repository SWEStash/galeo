import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';

// Copy buttons and Copy as rich text (#58): galeo writes the clipboard, never reads it (the test does).
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');

test('a code block has a Copy button, by mouse and by keyboard, that copies its code and says so', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'code.md');
  writeFileSync(file, '# Code\n\n```sh\nnpm test\nnpm run check\n```\n\nAfter.\n');
  const { app, window, close } = await launchApp(['--', file]);
  try {
    const block = shownDocument(window).locator('pre');
    await expect(block).toContainText('npm test');
    const copy = shownDocument(window).getByRole('button', { name: 'Copy code' });
    await app.evaluate(({ clipboard }) => clipboard.writeText('before'));
    await block.hover();
    await copy.click();
    const code = (await block.textContent())!;
    expect(code).toMatch(/^npm test\nnpm run check\n?$/);
    // Windows' clipboard gives text back with its own line endings.
    await expect.poll(async () => (await app.evaluate(({ clipboard }) => clipboard.readText())).replaceAll('\r\n', '\n')).toBe(code);
    await expect(window.getByTestId('status-message')).toHaveText('Copied');

    await app.evaluate(({ clipboard }) => clipboard.writeText('before'));
    await copy.focus();
    await expect(copy).toBeVisible();
    await window.keyboard.press('Enter');
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toContain('npm run check');
    const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="tab-panel"][data-active="true"]').analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test('Copy as rich text puts the rendered document and its plain text on the clipboard', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'notes.md');
  writeFileSync(file, '# Notes\n\nSome **bold** text.\n\n```js\nlet a = 1;\n```\n');
  const { app, window, close } = await launchApp(['--', file]);
  try {
    await expect(shownDocument(window).locator('h1')).toHaveText('Notes');
    await window.keyboard.press('ControlOrMeta+Shift+P');
    await window.getByTestId('palette').getByRole('combobox').fill('Copy as rich text');
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('status-message')).toHaveText('Copied as rich text');
    const html = await app.evaluate(async ({ clipboard }) => {
      const items = await clipboard.read();
      const item = items.find((each) => each.types.includes('text/html'));
      return item ? (await item.getType('text/html')).text() : '';
    });
    expect(html).toContain('Notes</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).not.toContain('galeo-code-copy');
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toContain('Some bold text.');
  } finally {
    await close();
    removeTempHome(dir);
  }
});
