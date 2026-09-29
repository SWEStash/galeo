import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCENTS } from '../../shared/accents';
import type { ProfileView, SettingsState } from '../../shared/contracts';
import type { Settings } from '../../shared/settings';
import { SettingsView } from './SettingsView';

const DEFAULTS: Settings = {
  themeMode: 'system',
  proseFont: 'Inter',
  codeFont: 'JetBrains Mono',
  fontSize: 17,
  measure: 72,
  statusBar: true,
  quickOpenExclude: [],
  warmTabs: 3,
  warmMegabytes: 20,
};

const STATE: SettingsState = {
  settings: { ...DEFAULTS, fontSize: 20, measure: 80 },
  shared: { ...DEFAULTS, measure: 80 },
  sources: {
    themeMode: 'default',
    proseFont: 'default',
    codeFont: 'default',
    fontSize: 'profile',
    measure: 'global',
    statusBar: 'default',
    quickOpenExclude: 'default',
    warmTabs: 'default',
    warmMegabytes: 'default',
  },
  notices: [],
  session: null,
  css: { global: '', profile: '' },
};

const PROFILE: ProfileView = { id: 'acme', name: 'Acme', accent: ACCENTS[1]!.color, running: true };

let roots: Root[] = [];

function stubBridge() {
  const settings = {
    set: vi.fn().mockResolvedValue({ ok: true }),
    reset: vi.fn().mockResolvedValue({ ok: true }),
    openCustomCss: vi.fn().mockResolvedValue(undefined),
  };
  const profiles = { update: vi.fn().mockResolvedValue({ ok: true }) };
  Object.defineProperty(window, 'galeo', { value: { settings, profiles }, configurable: true });
  return { settings, profiles };
}

async function render(state: SettingsState = STATE) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<SettingsView state={state} profile={PROFILE} />));
  return container;
}

/** The row of one setting, found by its visible label. */
const row = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll<HTMLElement>('[data-setting]')].find((each) =>
    [...each.querySelectorAll('label, [data-label], .react-aria-Label')].some((element) => element.textContent?.trim() === label),
  )!;
const button = (root: ParentNode, name: string) => [...root.querySelectorAll('button')].find((each) => each.textContent === name)!;

async function commit(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    input.focus();
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => input.blur());
}

afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = '';
});

describe('SettingsView (UX §6)', () => {
  it('shows each value with where it comes from', async () => {
    stubBridge();
    const container = await render();
    expect(container.querySelector('h1')?.textContent).toBe('Settings');
    expect(row(container, 'Font size').textContent).toContain('This profile');
    expect(row(container, 'Measure').textContent).toContain('All profiles');
    expect(row(container, 'Prose font').textContent).toContain('Default');
    expect(row(container, 'Font size').querySelector('input')!.value).toBe('20');
  });

  it("changes this profile's settings, and offers Reset to global only where it overrides", async () => {
    const { settings } = stubBridge();
    const container = await render();
    const dark = [...row(container, 'Theme').querySelectorAll('label')].find((each) => each.textContent === 'Dark')!;
    await act(async () => dark.click());
    expect(settings.set).toHaveBeenCalledWith('profile', { themeMode: 'dark' });
    expect(button(row(container, 'Measure'), 'Reset to global')).toBeUndefined();
    await act(async () => button(row(container, 'Font size'), 'Reset to global').click());
    expect(settings.reset).toHaveBeenCalledWith('fontSize');
  });

  it('commits a text setting when the field is left', async () => {
    const { settings } = stubBridge();
    const container = await render();
    await commit(row(container, 'Prose font').querySelector('input')!, 'Source Serif 4');
    expect(settings.set).toHaveBeenCalledWith('profile', { proseFont: 'Source Serif 4' });
    await commit(row(container, 'Excluded from quick open').querySelector('textarea')!, 'dist\n\n node_modules \n');
    expect(settings.set).toHaveBeenCalledWith('profile', { quickOpenExclude: ['dist', 'node_modules'] });
  });

  it('changes what all profiles get, showing their values, when asked to', async () => {
    const { settings } = stubBridge();
    const container = await render();
    const all = [...container.querySelectorAll('label')].find((each) => each.textContent === 'All profiles')!;
    await act(async () => all.click());
    expect(row(container, 'Font size').querySelector('input')!.value).toBe('17');
    expect(button(row(container, 'Font size'), 'Reset to global')).toBeUndefined();
    const light = [...row(container, 'Theme').querySelectorAll('label')].find((each) => each.textContent === 'Light')!;
    await act(async () => light.click());
    expect(settings.set).toHaveBeenCalledWith('global', { themeMode: 'light' });
  });

  it('says which file is left untouched when main refuses a write', async () => {
    const { settings } = stubBridge();
    settings.set.mockResolvedValue({ ok: false, path: '/cfg/profiles/acme/profile.json' });
    const container = await render();
    const dark = [...row(container, 'Theme').querySelectorAll('label')].find((each) => each.textContent === 'Dark')!;
    await act(async () => dark.click());
    const alert = await vi.waitFor(() => container.querySelector('[role="alert"]')!);
    expect(alert.textContent).toContain('/cfg/profiles/acme/profile.json');
  });

  it("recolours the profile, and opens either custom.css in the user's editor", async () => {
    const { settings, profiles } = stubBridge();
    const container = await render();
    const purple = [...container.querySelectorAll<HTMLElement>('[role="option"]')].find((each) => each.querySelector('[aria-label="Purple"]'))!;
    await act(async () => purple.click());
    expect(profiles.update).toHaveBeenCalledWith('Acme', ACCENTS[7]!.color);
    await act(async () => button(container, 'Open CSS for this profile').click());
    await act(async () => button(container, 'Open CSS for all profiles').click());
    expect(settings.openCustomCss.mock.calls).toEqual([['profile'], ['global']]);
  });
});
