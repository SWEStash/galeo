import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTooltips } from './tooltips';

let stop: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<button id="named" title="Search tabs (Ctrl+Shift+A)"><svg></svg></button><button id="text" title="Copy or reveal">/d/a.md</button><p id="plain">text</p>';
  stop = installTooltips();
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const over = (element: Element) => element.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, composed: true }));
const out = (element: Element, to: Element | null = document.body) => element.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, composed: true, relatedTarget: to }));
const tip = () => document.querySelector<HTMLElement>('.galeo-tooltip')!;
const byId = (id: string) => document.getElementById(id)!;

describe('installTooltips', () => {
  it("shows the title of what the pointer rests on in galeo's tooltip, with the system's out of the way, and puts it back after", () => {
    over(byId('named'));
    expect(byId('named').hasAttribute('title')).toBe(false);
    expect(tip().hidden).toBe(true);
    vi.advanceTimersByTime(450);
    expect(tip().hidden).toBe(false);
    expect(tip().textContent).toBe('Search tabs (Ctrl+Shift+A)');
    expect(tip().getAttribute('aria-hidden')).toBe('true');
    out(byId('named'));
    expect(tip().hidden).toBe(true);
    expect(byId('named').getAttribute('title')).toBe('Search tabs (Ctrl+Shift+A)');
  });

  it('keeps the name of a control named only by its title', () => {
    over(byId('named'));
    expect(byId('named').getAttribute('aria-label')).toBe('Search tabs (Ctrl+Shift+A)');
    out(byId('named'));
    over(byId('text'));
    expect(byId('text').hasAttribute('aria-label')).toBe(false);
  });

  it('shows the next one at once, and none for an element without a title or once a key is pressed', () => {
    over(byId('named'));
    vi.advanceTimersByTime(450);
    out(byId('named'), byId('text'));
    over(byId('text'));
    vi.advanceTimersByTime(0);
    expect(tip().textContent).toBe('Copy or reveal');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(tip().hidden).toBe(true);
    over(byId('plain'));
    vi.advanceTimersByTime(1000);
    expect(tip().hidden).toBe(true);
  });
});
