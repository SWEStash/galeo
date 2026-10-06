import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from '../helpers/launch';
import { summarize } from './stats';

const HEAVY = path.resolve(import.meta.dirname, '../fixtures/docs/heavy-diagrams.md');
/** Pixels scrolled per frame: a brisk wheel scroll. */
const STEP_PX = 120;

// Report-only: diagrams draw as they scroll into view, and this records what that costs per frame
// (one frame at 60 Hz is 16.7 ms). Nothing fails on the numbers yet.
test('scrolling through 40 diagrams: frame times', async () => {
  const { window, close } = await launchApp(['--', HEAVY]);
  try {
    const view = window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
    await expect(view.locator('.galeo-diagram').first()).toHaveAttribute('data-state', 'rendered');
    const frames = await view.evaluate(async (element, step) => {
      const intervals: number[] = [];
      let last = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      while (element.scrollTop + element.clientHeight < element.scrollHeight - 1) {
        element.scrollTop += step;
        const now = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
        intervals.push(now - last);
        last = now;
      }
      return intervals;
    }, STEP_PX);
    const summary = summarize(frames);
    const dir = path.join(import.meta.dirname, 'results');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'diagram-scroll.json'),
      `${JSON.stringify({ metric: 'diagram-scroll', measuredAt: new Date().toISOString(), platform: process.platform, ci: Boolean(process.env['CI']), ms: summary }, null, 2)}\n`,
    );
    console.log(`diagram-scroll: median ${summary.median.toFixed(1)} ms, p95 ${summary.p95.toFixed(1)} ms per frame (n=${summary.n})`);
  } finally {
    await close();
  }
});

/** Reading: one screen in 8 frames, then a pause; frame times are taken only while moving. */
test('reading through 40 diagrams, a screen at a time: frame times while scrolling', async () => {
  test.setTimeout(180_000);
  const { window, close } = await launchApp(['--', HEAVY]);
  try {
    const view = window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
    await expect(view.locator('.galeo-diagram').first()).toHaveAttribute('data-state', 'rendered');
    const frames = await view.evaluate(async (element) => {
      const intervals: number[] = [];
      const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
      const step = element.clientHeight / 8;
      while (element.scrollTop + element.clientHeight < element.scrollHeight - 1) {
        let last = await frame();
        for (let n = 0; n < 8; n++) {
          element.scrollTop += step;
          const now = await frame();
          intervals.push(now - last);
          last = now;
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      return intervals;
    });
    const summary = summarize(frames);
    const dir = path.join(import.meta.dirname, 'results');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'diagram-reading.json'),
      `${JSON.stringify({ metric: 'diagram-reading', measuredAt: new Date().toISOString(), platform: process.platform, ci: Boolean(process.env['CI']), ms: summary }, null, 2)}\n`,
    );
    const dropped = frames.filter((ms) => ms > 34).length;
    console.log(`diagram-reading: median ${summary.median.toFixed(1)} ms, p95 ${summary.p95.toFixed(1)} ms, max ${summary.max.toFixed(1)} ms, ${dropped} frames over 34 ms, per frame while scrolling (n=${summary.n})`);
  } finally {
    await close();
  }
});

