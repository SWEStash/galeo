import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SandboxUnavailable, UnsandboxedBadge } from './StartupScreens';

async function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  await act(async () => createRoot(container).render(node));
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('UnsandboxedBadge', () => {
  it('shows a text badge whose tooltip explains the risk and the way back', async () => {
    const container = await render(<UnsandboxedBadge />);
    const badge = container.querySelector('[data-testid="unsandboxed-badge"]');
    expect(badge?.textContent).toContain('Unsandboxed');
    expect(badge?.getAttribute('title')).toMatch(/full permissions/);
    expect(badge?.getAttribute('title')).toMatch(/--no-sandbox/);
  });
});

describe('SandboxUnavailable', () => {
  it('names the detected cause and the fix', async () => {
    const container = await render(<SandboxUnavailable cause="apparmor-userns" onChoose={vi.fn()} />);
    expect(container.textContent).toMatch(/user namespaces/);
    expect(container.textContent).toMatch(/\.deb/);
    expect(container.textContent).toMatch(/full permissions/);
    expect(container.textContent).toMatch(/this launch only/);
  });

  it('has Quit as the focused default', async () => {
    const container = await render(<SandboxUnavailable cause="unknown" onChoose={vi.fn()} />);
    expect(document.activeElement?.textContent).toBe('Quit');
    expect(container.querySelector('button')?.textContent).toBe('Quit');
  });

  it.each([
    ['Quit', 'quit'],
    ['Run without sandbox', 'run-unsandboxed'],
  ] as const)('reports "%s" as %s', async (label, choice) => {
    const onChoose = vi.fn();
    const container = await render(<SandboxUnavailable cause="suid-helper" onChoose={onChoose} />);
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === label);
    await act(async () => button?.click());
    expect(onChoose).toHaveBeenCalledWith(choice);
  });

  it('quits on Escape', async () => {
    const onChoose = vi.fn();
    await render(<SandboxUnavailable cause="suid-helper" onChoose={onChoose} />);
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onChoose).toHaveBeenCalledWith('quit');
  });
});
