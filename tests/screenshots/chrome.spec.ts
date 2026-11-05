// Every surface of the interface around the document, light and dark, to compare a restyle with.
// Not part of CI: run `npm run build`, then
// `GALEO_SHOTS_DIR=<dir> npm run headless -- npx playwright test --project=screenshots tests/screenshots/chrome.spec.ts`.
import { appendFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { launchApp } from '../helpers/launch';
import { ALL, file, palette, shoot, shown, showTab, useShowcase, type ShotOptions } from './shoot';

const OUT = path.resolve(process.env['GALEO_SHOTS_DIR'] ?? path.resolve(import.meta.dirname, '../../.local/design/shots'));
useShowcase(OUT);

/** Runs galeo once on every showcase file, so the shot's launch restores them hibernated. */
async function session(home: string) {
  const { window, close } = await launchApp(['--', ...ALL.map(file)], { home });
  try {
    await expect(window.getByRole('tab')).toHaveCount(ALL.length);
    await showTab(window, 'plan.md');
  } finally {
    await close();
  }
}

/** Restored tabs with one updated in the background, and the pointer over another tab. */
async function tabStates(window: Page) {
  await expect(window.getByRole('tab')).toHaveCount(ALL.length);
  await showTab(window, 'search.log');
  await showTab(window, 'plan.md');
  appendFileSync(file('search.log'), '2026-11-05T10:00:00Z INFO query served in 41 ms\n');
  await expect(window.getByRole('tab', { name: /search\.log.*changed on disk/ })).toBeVisible();
  await window.getByRole('tab', { name: /results\.json/ }).hover();
}

type Shot = { name: string; files?: string[]; options?: ShotOptions; arrange: (window: Page, app: ElectronApplication) => Promise<void> };

const SHOTS: Shot[] = [
  { name: 'tabs-top', files: [], options: { before: session, keepPointer: true }, arrange: tabStates },
  { name: 'tabs-left', files: [], options: { before: session, keepPointer: true, tabsPosition: 'left' }, arrange: tabStates },
  {
    name: 'tabs-left-collapsed',
    options: { tabsPosition: 'left' },
    arrange: async (window) => {
      await showTab(window, 'plan.md');
      await window.keyboard.press('ControlOrMeta+Shift+B');
    },
  },
  {
    name: 'edit',
    arrange: async (window, app) => {
      await showTab(window, 'config.yaml');
      await pressInMain(app, window, 'E');
      await expect(window.getByTestId('status-mode')).toHaveText('Editing');
      await window.keyboard.press('ControlOrMeta+End');
      await window.keyboard.type('\n# edited');
    },
  },
  {
    name: 'log-follow',
    arrange: async (window) => {
      await showTab(window, 'search.log');
      await window.keyboard.press('End');
    },
  },
  {
    name: 'profile-menu',
    arrange: async (window) => {
      await showTab(window, 'plan.md');
      await window.getByTestId('profile-chip').click();
    },
  },
  {
    name: 'palette',
    arrange: async (window) => {
      await showTab(window, 'plan.md');
      await window.keyboard.press('ControlOrMeta+Shift+P');
      await expect(window.getByTestId('palette')).toBeVisible();
    },
  },
  {
    name: 'quick-open',
    arrange: async (window) => {
      await showTab(window, 'plan.md');
      await window.keyboard.press('ControlOrMeta+P');
      await expect(window.getByTestId('quick-open')).toBeVisible();
    },
  },
  {
    name: 'tab-search',
    arrange: async (window) => {
      await window.keyboard.press('ControlOrMeta+Shift+A');
      await expect(window.getByTestId('tab-search')).toBeVisible();
    },
  },
  {
    name: 'tab-overview',
    arrange: async (window) => {
      await window.keyboard.press('ControlOrMeta+Shift+E');
      await expect(window.getByTestId('tab-overview')).toBeVisible();
    },
  },
  {
    name: 'find-all',
    arrange: async (window) => {
      await window.keyboard.press('ControlOrMeta+Shift+F');
      await window.getByTestId('find-all').getByRole('combobox').fill('p95');
      await expect(window.getByTestId('find-all').getByRole('group').first()).toBeVisible();
    },
  },
  {
    name: 'find-outline',
    arrange: async (window) => {
      await showTab(window, 'plan.md');
      await window.keyboard.press('ControlOrMeta+Shift+O');
      await expect(window.getByTestId('outline')).toBeVisible();
      await window.keyboard.press('ControlOrMeta+F');
      await window.keyboard.type('p95');
    },
  },
  {
    name: 'settings',
    arrange: async (window) => {
      await palette(window, 'Settings');
      await expect(window.getByTestId('settings-view')).toBeVisible();
    },
  },
  {
    name: 'viewer',
    arrange: async (window) => {
      await showTab(window, 'plan.md');
      const expand = shown(window).getByRole('button', { name: 'Expand diagram' }).first();
      await expand.focus();
      await expand.click();
    },
  },
  {
    name: 'missing-file',
    arrange: async (window) => {
      await showTab(window, 'config.yaml');
      rmSync(file('config.yaml'));
      await expect(window.getByRole('tab', { name: /config\.yaml.*file missing/ })).toBeVisible();
    },
  },
  { name: 'empty-window', files: [], arrange: async (window) => void (await expect(window.getByTestId('empty-window')).toBeVisible()) },
];

for (const theme of ['light', 'dark'] as const) {
  for (const shot of SHOTS) {
    test(`${shot.name}, ${theme}`, async () => {
      await shoot(OUT, `${shot.name}-${theme}`, shot.files ?? ALL, shot.arrange, { ...shot.options, theme });
    });
  }
}
