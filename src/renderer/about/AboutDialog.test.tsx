import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AboutDialog } from './AboutDialog';

const notices = vi.hoisted(() => ({
  packages: [
    { packages: [{ name: '@react-aria/a', version: '3.0.0', license: 'Apache-2.0' }, { name: '@react-aria/b', version: '3.1.0', license: 'Apache-2.0' }], texts: ['Apache text', 'NOTICE text'] },
    { packages: [{ name: 'unified', version: '11.0.5', license: 'MIT' }], texts: ['MIT text'] },
  ],
  fonts: [{ name: 'inter', text: 'SIL OPEN FONT LICENSE' }],
  electron: 'Electron MIT text',
}));
vi.mock('./notices', () => ({ loadNotices: () => Promise.resolve(notices) }));

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

async function render(onClose = vi.fn()) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<AboutDialog version="0.1.0" onClose={onClose} />));
  return onClose;
}

describe('AboutDialog', () => {
  it("names galeo's version and licence, and where Chromium's licences are", async () => {
    await render();
    const dialog = document.querySelector('[data-testid="about"]')!;
    expect(dialog.querySelector('h2')?.textContent).toBe('galeo 0.1.0');
    expect(dialog.textContent).toContain('MIT licence');
    expect(dialog.textContent).toContain('LICENSES.chromium.html');
  });

  it("lists every notice, each package group's terms once", async () => {
    await render();
    await vi.waitFor(() => expect(document.querySelectorAll('[data-testid="about-notices"] details')).toHaveLength(4));
    const summaries = [...document.querySelectorAll('[data-testid="about-notices"] summary')].map((summary) => summary.textContent);
    expect(summaries).toEqual(['Electron · MIT', 'inter (font) · OFL-1.1', '@react-aria/a 3.0.0, @react-aria/b 3.1.0 · Apache-2.0', 'unified 11.0.5 · MIT']);
    expect(document.querySelectorAll('pre')[2]!.textContent).toBe('Apache text\n\nNOTICE text');
  });

  it('closes on its button', async () => {
    const onClose = await render();
    await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Close')!.click());
    expect(onClose).toHaveBeenCalled();
  });
});
