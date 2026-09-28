import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from '../helpers/launch';

const fixture = (name: string) => path.resolve(import.meta.dirname, '../fixtures/docs', name);

let dir: string;
test.beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'galeo-states-'));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function expectState(file: string, state: string, title: string) {
  const { window, close } = await launchApp(['--', file]);
  try {
    const element = window.getByTestId('document-state');
    await expect(element).toHaveAttribute('data-state', state);
    await expect(element.locator('.document-state-title')).toHaveText(title);
    await expect(element).toContainText(file);
    return;
  } finally {
    await close();
  }
}

test('an empty file says so', async () => {
  await expectState(fixture('empty.md'), 'empty', 'This file is empty');
});

test('a missing file says it was not found', async () => {
  await expectState(path.join(dir, 'gone.md'), 'missing', 'File not found');
});

test('an unreadable file says permission was denied', async () => {
  test.skip(process.platform === 'win32' || process.getuid?.() === 0, 'needs POSIX permissions as a normal user');
  const file = path.join(dir, 'secret.md');
  writeFileSync(file, '# secret');
  chmodSync(file, 0o000);
  await expectState(file, 'no-permission', "galeo can't read this file (permission denied)");
});

test('a binary file is not displayed', async () => {
  const { window, close } = await launchApp(['--', fixture('binary.bin')]);
  try {
    const element = window.getByTestId('document-state');
    await expect(element.locator('.document-state-title')).toHaveText('This looks like a binary file');
    await expect(element).toContainText('20 B · BIN');
  } finally {
    await close();
  }
});

test('a folder is not a document', async () => {
  await expectState(dir, 'not-a-file', "This isn't a regular file");
});

test('Markdown over the render limit opens as source; rendering it anyway shows the skeleton', async () => {
  const file = path.join(dir, 'big.md');
  writeFileSync(file, `# Big\n\n${'A line of an oversized plan.\n'.repeat(200_000)}`);
  const { window, close } = await launchApp(['--', file]);
  // Reading, showing and posting 5.6 MB to the worker is heavy work, and slow on a busy machine;
  // this test is about the states, not their speed.
  const heavy = { timeout: 20_000 };
  try {
    const banner = window.locator('[data-banner="too-large"]');
    await expect(banner).toContainText('Large file shown as source', heavy);
    await expect(window.getByTestId('document').locator('.cm-editor')).toBeVisible();
    await banner.getByRole('button', { name: 'Render anyway' }).click();
    await expect(banner).toHaveCount(0);
    // Several megabytes take the worker well over 150 ms, so the skeleton shows while it works.
    await expect(window.getByTestId('document-loading')).toBeVisible(heavy);
  } finally {
    await close();
  }
});

test('text in a guessed encoding is shown with a banner naming it', async () => {
  const { window, close } = await launchApp(['--', fixture('latin1.txt')]);
  try {
    await expect(window.locator('[data-banner="encoding"]')).toContainText('Windows-1252');
    await expect(window.getByTestId('document').locator('article p')).toHaveText('Café crème – français');
  } finally {
    await close();
  }
});

test('a formula that fails shows its error in place and the rest renders', async () => {
  const { window, close } = await launchApp(['--', fixture('math-error.md')]);
  try {
    const document = window.getByTestId('document');
    await expect(document.locator('.galeo-block-error')).toHaveCount(2);
    await expect(document.locator('.galeo-block-error').first()).toContainText('KaTeX parse error');
    await expect(document.locator('.katex').first()).toBeVisible();
    await expect(document.locator('p', { hasText: 'The rest renders.' })).toBeVisible();
  } finally {
    await close();
  }
});
