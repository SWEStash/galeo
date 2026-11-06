import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';

// Export to PDF (#56): main asks where (answered by GALEO_TEST_SAVE_PATH), the page readies a print
// copy, main prints the window into that file.
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const savePath = (app: ElectronApplication, file: string) => app.evaluate((_electron, value) => void (process.env['GALEO_TEST_SAVE_PATH'] = value), file);

async function exportFromPalette(window: Page) {
  await window.keyboard.press('ControlOrMeta+Shift+P');
  await window.getByTestId('palette').getByRole('combobox').fill('Export to PDF');
  await window.keyboard.press('Enter');
}

test('Export to PDF writes the rendered document to the file picked, and leaves no copy behind', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'notes.md');
  const pdf = path.join(dir, 'notes.pdf');
  writeFileSync(file, `# Notes\n\nSome **bold** text.\n\n\`\`\`js\nconst a = 1;\n\`\`\`\n\n\`\`\`mermaid\nflowchart LR\n  A --> B\n\`\`\`\n\n${'More text. '.repeat(400)}\n`);
  const { app, window, close } = await launchApp(['--', file], { env: { GALEO_TEST_SAVE_PATH: pdf } });
  try {
    await expect(shownDocument(window).locator('h1')).toHaveText('Notes');
    await exportFromPalette(window);
    await expect(window.getByTestId('status-message')).toHaveText('Exported to PDF', { timeout: 20_000 });
    const bytes = readFileSync(pdf);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect((bytes.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
    await expect(window.locator('.galeo-print')).toHaveCount(0);

    // Cancelling the dialog writes nothing and says nothing.
    const other = path.join(dir, 'other.pdf');
    await savePath(app, '');
    await exportFromPalette(window);
    await expect(window.locator('.galeo-print')).toHaveCount(0);
    expect(existsSync(other)).toBe(false);
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test('the document menu offers Export to PDF on rendered Markdown only, and the source view says why not', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'notes.md');
  writeFileSync(file, '# Notes\n');
  const { window, close } = await launchApp(['--', file], { env: { GALEO_TEST_SAVE_PATH: path.join(dir, 'x.pdf') } });
  try {
    await expect(shownDocument(window).locator('h1')).toHaveText('Notes');
    await window.keyboard.press('ControlOrMeta+U');
    await expect(window.getByTestId('status-view')).toHaveText('Source');
    await exportFromPalette(window);
    await expect(window.getByTestId('status-message')).toHaveText('Export to PDF works on a rendered Markdown document');
    expect(existsSync(path.join(dir, 'x.pdf'))).toBe(false);
  } finally {
    await close();
    removeTempHome(dir);
  }
});
