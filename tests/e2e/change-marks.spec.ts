import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';
import { saveFile } from '../helpers/save';

const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const paragraphs = (texts: string[]) => `# Plan\n\n${texts.map((text) => `${text}\n`).join('\n')}`;
const twelve = Array.from({ length: 12 }, (_, n) => `Step ${n + 1} of the plan.`);

/** Opens plan.md and notes.md, looks at the plan, then shows the notes: the plan's baseline is what it showed. */
async function leftThePlan() {
  const dir = tempHome();
  const plan = path.join(dir, 'plan.md');
  const notes = path.join(dir, 'notes.md');
  writeFileSync(plan, paragraphs(twelve));
  writeFileSync(notes, '# Notes\n');
  const launched = await launchApp(['--', plan, notes], { home: dir });
  const { window } = launched;
  const tab = (name: string) => window.getByRole('tab', { name: new RegExp(`^${name}`) });
  await tab('plan.md').click();
  await expect(shownDocument(window).locator('p').first()).toHaveText('Step 1 of the plan.');
  await tab('notes.md').click();
  await expect(shownDocument(window).locator('h1')).toHaveText('Notes');
  return { ...launched, dir, plan, tab };
}

test('coming back to a tab marks what changed since you left it; F7 walks the marks; Clear removes them', async () => {
  const { window, close, dir, plan, tab } = await leftThePlan();
  try {
    // An agent edits step 3, removes step 8 and adds a last step.
    const next = [...twelve];
    next[2] = 'Step 3, rewritten.';
    next.splice(7, 1);
    next.push('Step 13, new.');
    saveFile(plan, paragraphs(next));
    await expect(tab('plan.md')).toHaveAccessibleName(/changed on disk/);

    await tab('plan.md').click();
    const document = shownDocument(window);
    await expect(document.locator('p.galeo-changed')).toHaveText(['Step 3, rewritten.', 'Step 13, new.']);
    await expect(document.locator('.galeo-removed-before')).toHaveText('Step 9 of the plan.');
    await expect(document.locator('p.galeo-changed').first()).toHaveAttribute('aria-description', 'changed');
    await expect(window.getByTestId('status-changes')).toHaveText('3 changes');

    await window.keyboard.press('F7');
    await expect(window.getByTestId('status-message')).toHaveText('Change 1 of 3');
    await window.keyboard.press('F7');
    await expect(window.getByTestId('status-message')).toHaveText('Change 2 of 3');
    await window.keyboard.press('Shift+F7');
    await expect(window.getByTestId('status-message')).toHaveText('Change 1 of 3');

    // The source view marks the same changes as lines.
    await window.keyboard.press('ControlOrMeta+U');
    // Lines with text: the blank line that came with the new step is marked too.
    await expect(document.locator('.cm-line.galeo-changed').filter({ hasText: /\S/ })).toHaveText(['Step 3, rewritten.', 'Step 13, new.']);
    await window.keyboard.press('ControlOrMeta+U');

    await window.keyboard.press('ControlOrMeta+Shift+P');
    await window.keyboard.type('Clear change marks');
    await window.keyboard.press('Enter');
    await expect(document.locator('.galeo-changed, .galeo-removed-before')).toHaveCount(0);
    await expect(window.getByTestId('status-changes')).toHaveCount(0);
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test('changes add up while you watch, and your own saves are never marked', async () => {
  const { app, window, close, dir, plan, tab } = await leftThePlan();
  try {
    await tab('plan.md').click();
    const document = shownDocument(window);
    saveFile(plan, paragraphs([...twelve, 'Step 13.']));
    await expect(document.locator('p.galeo-changed')).toHaveText(['Step 13.']);
    saveFile(plan, paragraphs([...twelve, 'Step 13.', 'Step 14.']));
    await expect(document.locator('p.galeo-changed')).toHaveText(['Step 13.', 'Step 14.']);

    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    await expect(document.locator('.cm-content')).toBeFocused();
    await window.keyboard.press('ControlOrMeta+End');
    await window.keyboard.type('\nStep 15, mine.\n');
    await window.keyboard.press('ControlOrMeta+s');
    await expect(window.getByTestId('status-message')).toHaveText('Saved');
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Read-only');
    // Edit mode left the source view showing: no marks there, nor in the rendered view.
    await expect(document.locator('.cm-line').filter({ hasText: 'Step 15, mine.' })).toBeVisible();
    await expect(document.locator('.galeo-changed')).toHaveCount(0);
    await window.keyboard.press('ControlOrMeta+U');
    await expect(document.locator('p').last()).toHaveText('Step 15, mine.');
    await expect(document.locator('.galeo-changed')).toHaveCount(0);
  } finally {
    await close();
    removeTempHome(dir);
  }
});
