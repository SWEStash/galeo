import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from '../helpers/launch';

const root = path.resolve(import.meta.dirname, '../..');
const MERMAID_FENCE = /^```mermaid\s*$/gm;

/** galeo's own docs that hold Mermaid diagrams, with how many each holds (a new doc joins by itself). */
const docs = [
  'README.md',
  ...readdirSync(path.join(root, 'docs'), { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join('docs', name)),
]
  .map((name) => ({ name, blocks: readFileSync(path.join(root, name), 'utf8').match(MERMAID_FENCE)?.length ?? 0 }))
  .filter((doc) => doc.blocks > 0);

const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');

test('the docs hold diagrams to check', () => {
  expect(docs.length).toBeGreaterThan(0);
});

for (const { name, blocks } of docs) {
  test(`every diagram in ${name} draws`, async () => {
    const { window, close } = await launchApp(['--', path.join(root, name)]);
    try {
      await expect(shownDocument(window).locator('h1').first()).toBeVisible();
      const diagrams = shownDocument(window).locator('.galeo-diagram');
      await expect(diagrams).toHaveCount(blocks);
      for (let index = 0; index < blocks; index++) {
        const diagram = diagrams.nth(index);
        await diagram.scrollIntoViewIfNeeded();
        await expect(diagram).not.toHaveAttribute('data-state', 'pending');
        const failure = diagram.locator('.galeo-block-error-message');
        expect(await failure.count(), `diagram ${index + 1} of ${blocks}: ${await failure.allTextContents()}`).toBe(0);
        await expect(diagram).toHaveAttribute('data-state', 'rendered');
      }
    } finally {
      await close();
    }
  });
}
