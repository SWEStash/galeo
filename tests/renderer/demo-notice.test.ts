import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoNotice } from '../../src/demo/notice';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('demoNotice (the demo)', () => {
  it('says what needs the app, with a link to install it, then hides', () => {
    vi.useFakeTimers();
    const say = demoNotice(document, '../#install');
    const box = document.querySelector<HTMLElement>('.demo-notice')!;
    expect(box.hidden).toBe(true);
    expect(box.getAttribute('role')).toBe('status');
    say('Export to PDF needs the app.');
    expect(box.hidden).toBe(false);
    expect(box.textContent).toContain('Export to PDF needs the app.');
    expect(box.querySelector('a')!.getAttribute('href')).toBe('../#install');
    vi.advanceTimersByTime(8000);
    expect(box.hidden).toBe(true);
  });

  it('replaces the last message, and Dismiss hides it', () => {
    const say = demoNotice(document, '../#install');
    say('one');
    say('two');
    const box = document.querySelector<HTMLElement>('.demo-notice')!;
    expect(box.querySelector('span')!.textContent).toBe('two');
    box.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')!.click();
    expect(box.hidden).toBe(true);
  });
});
