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
  tableSeparator: 'auto',
  tableHeader: true,
  tabsPosition: 'top',
  tabPanelWidth: 220,
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
    tableSeparator: 'default',
    tableHeader: 'default',
    tabsPosition: 'default',
    tabPanelWidth: 'default',
  },
  notices: [],
  session: null,
  css: { global: '', profile: '' },
};

const PROFILE: ProfileView = { id: 'acme', name: 'Acme', accent: ACCENTS[1]!.color, running: true };

const INSTALLED = [
  { family: 'DejaVu Sans', mono: false },
  { family: 'Hack', mono: true },
  { family: 'JetBrains Mono', mono: true },
];

let roots: Root[] = [];
const say = vi.fn();

function stubBridge() {
  const settings = {
    set: vi.fn().mockResolvedValue({ ok: true }),
    reset: vi.fn().mockResolvedValue({ ok: true }),
    openCustomCss: vi.fn().mockResolvedValue(undefined),
    fonts: vi.fn().mockResolvedValue(INSTALLED),
  };
  const profiles = { update: vi.fn().mockResolvedValue({ ok: true }) };
  const app = { installLauncher: vi.fn().mockResolvedValue({ ok: true, bin: '/home/u/.local/bin/galeo' }) };
  Object.defineProperty(window, 'galeo', { value: { settings, profiles, app }, configurable: true });
  return { settings, profiles, app };
}

async function render(state: SettingsState = STATE, appImage = false, onAbout: () => void = () => {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<SettingsView state={state} profile={PROFILE} appImage={appImage} version="0.3.0" onAbout={onAbout} say={say} />));
  const update = (next: SettingsState) => act(async () => root.render(<SettingsView state={next} profile={PROFILE} appImage={appImage} version="0.3.0" onAbout={onAbout} say={say} />));
  return Object.assign(container, { update });
}

/** The row of one setting, found by its visible label. */
const row = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll<HTMLElement>('[data-setting]')].find((each) =>
    [...each.querySelectorAll('label, [data-label], .react-aria-Label')].some((element) => element.textContent?.trim() === label),
  )!;
const button = (root: ParentNode, name: string) => [...root.querySelectorAll('button')].find((each) => each.textContent === name)!;

/** Opens a font picker's list with its button, as a reader would. */
async function openPicker(setting: HTMLElement) {
  await act(async () => setting.querySelector<HTMLButtonElement>('button[aria-haspopup]')!.click());
  await vi.waitFor(() => expect(document.querySelector('[role=listbox]')).not.toBeNull());
}

/** The open picker's sections: each header and its options' names. */
const sections = () =>
  [...document.querySelectorAll('[role=listbox] section')].map((section) => [
    section.querySelector('header')?.textContent,
    [...section.querySelectorAll('[role=option]')].map((each) => each.textContent),
  ]);
const option = (name: string) => [...document.querySelectorAll<HTMLElement>('[role=option]')].find((each) => each.textContent === name)!;

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
  say.mockReset();
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

  it('offers measure presets, and a custom width for any other', async () => {
    const { settings } = stubBridge();
    const container = await render({ ...STATE, settings: { ...STATE.settings, measure: 72 } });
    const measure = row(container, 'Measure');
    const choice = (name: string) => [...measure.querySelectorAll('label')].find((each) => each.textContent === name)!;
    const radio = (name: string) => choice(name).querySelector<HTMLInputElement>('input[type=radio]')!;
    expect(radio('Normal (72)').checked).toBe(true);
    const custom = () => measure.querySelector<HTMLInputElement>('input:not([type=radio])')!;
    expect(custom().disabled).toBe(true);
    await act(async () => choice('Wide (100)').click());
    expect(settings.set).toHaveBeenLastCalledWith('profile', { measure: 100 });
    await act(async () => choice('Full width').click());
    expect(settings.set).toHaveBeenLastCalledWith('profile', { measure: 'full' });

    await container.update({ ...STATE, settings: { ...STATE.settings, measure: 90 } });
    expect(radio('Custom').checked).toBe(true);
    expect(custom().disabled).toBe(false);
    expect(custom().value).toBe('90');
    await commit(custom(), '96');
    expect(settings.set).toHaveBeenLastCalledWith('profile', { measure: 96 });
  });

  it("puts this profile's tabs on the left or on top, and sets the side panel's width (ADR-023)", async () => {
    const { settings } = stubBridge();
    const container = await render();
    const tabs = row(container, 'Tabs');
    const choice = (name: string) => [...tabs.querySelectorAll('label')].find((each) => each.textContent === name)!;
    expect(choice('Top').querySelector<HTMLInputElement>('input[type=radio]')!.checked).toBe(true);
    await act(async () => choice('Left').click());
    expect(settings.set).toHaveBeenLastCalledWith('profile', { tabsPosition: 'left' });
    const width = row(container, 'Tab panel width').querySelector('input')!;
    expect(width.value).toBe('220');
    await commit(width, '300');
    expect(settings.set).toHaveBeenLastCalledWith('profile', { tabPanelWidth: 300 });
  });

  it('lets Custom start from a preset without changing the width', async () => {
    const { settings } = stubBridge();
    const container = await render({ ...STATE, settings: { ...STATE.settings, measure: 60 } });
    const measure = row(container, 'Measure');
    await act(async () => [...measure.querySelectorAll('label')].find((each) => each.textContent === 'Custom')!.click());
    const custom = measure.querySelector<HTMLInputElement>('input:not([type=radio])')!;
    expect(custom.disabled).toBe(false);
    expect(custom.value).toBe('60');
    expect(settings.set).not.toHaveBeenCalled();
  });

  it('lists the bundled fonts first, then the installed ones, asking main once', async () => {
    const { settings } = stubBridge();
    const container = await render();
    await openPicker(row(container, 'Prose font'));
    expect(sections()).toEqual([
      ['Bundled', ['Inter', 'Source Serif 4', 'JetBrains Mono']],
      // A bundled family isn't listed again.
      ['Installed', ['DejaVu Sans', 'Hack']],
    ]);
    // Each option is drawn in its own family.
    expect(option('Hack').style.fontFamily).toContain('Hack');
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await openPicker(row(container, 'Code font'));
    expect(settings.fonts).toHaveBeenCalledTimes(1);
  });

  it('offers monospace families only for the code font, and saves the one chosen', async () => {
    const { settings } = stubBridge();
    const container = await render();
    await openPicker(row(container, 'Code font'));
    expect(sections()).toEqual([
      ['Bundled', ['JetBrains Mono']],
      ['Installed', ['Hack']],
    ]);
    await act(async () => option('Hack').click());
    expect(settings.set).toHaveBeenCalledWith('profile', { codeFont: 'Hack' });
  });

  it('offers the bundled fonts only when none can be listed', async () => {
    const { settings } = stubBridge();
    settings.fonts.mockResolvedValue([]);
    const container = await render();
    await openPicker(row(container, 'Prose font'));
    expect(sections()).toEqual([['Bundled', ['Inter', 'Source Serif 4', 'JetBrains Mono']]]);
  });

  it('shows a preview line in the chosen font, under each picker', async () => {
    stubBridge();
    const container = await render({ ...STATE, settings: { ...STATE.settings, codeFont: 'Hack' } });
    const preview = row(container, 'Code font').querySelector<HTMLElement>('.font-preview')!;
    expect(preview.textContent).toMatch(/\S/);
    expect(preview.style.fontFamily).toContain('Hack');
    expect(preview.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the version, with a way to About galeo', async () => {
    stubBridge();
    const onAbout = vi.fn();
    const container = await render(STATE, false, onAbout);
    const about = container.querySelector<HTMLElement>('[data-setting="about"]')!;
    expect(about.textContent).toContain('galeo 0.3.0');
    await act(async () => button(about, 'About galeo').click());
    expect(onAbout).toHaveBeenCalledTimes(1);
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

  it('offers the command-line launcher to an AppImage only, and says where the command went', async () => {
    const { app } = stubBridge();
    const plain = await render();
    expect(button(plain, 'Install command-line launcher')).toBeUndefined();
    const container = await render(STATE, true);
    await act(async () => button(container, 'Install command-line launcher').click());
    expect(app.installLauncher).toHaveBeenCalled();
    await vi.waitFor(() => expect(container.querySelector('[data-testid="launcher-result"]')?.textContent).toContain('/home/u/.local/bin/galeo'));
  });

  it('says why the launcher was not installed', async () => {
    const { app } = stubBridge();
    app.installLauncher.mockResolvedValue({ ok: false, reason: "/home/u/.local/bin/galeo exists and is not galeo's" });
    const container = await render(STATE, true);
    await act(async () => button(container, 'Install command-line launcher').click());
    await vi.waitFor(() => expect(container.querySelector('[data-testid="launcher-result"]')?.textContent).toContain('is not galeo'));
  });

  it('says the launcher was not installed when installing failed outright', async () => {
    const { app } = stubBridge();
    app.installLauncher.mockRejectedValue(new Error('EACCES'));
    const container = await render(STATE, true);
    await act(async () => button(container, 'Install command-line launcher').click());
    await vi.waitFor(() => expect(container.querySelector('[data-testid="launcher-result"]')?.textContent).toContain('Not installed'));
  });

  it("keeps focus on a control when main sends back the change it made (keyboard use, WCAG 2.4.3)", async () => {
    stubBridge();
    const container = await render();
    const size = row(container, 'Font size').querySelector('input')!;
    const prose = row(container, 'Prose font').querySelector('input')!;
    await act(async () => size.focus());
    await container.update({ ...STATE, settings: { ...STATE.settings, fontSize: 21 } });
    expect(document.activeElement).toBe(size);
    expect(size.value).toBe('21');
    await act(async () => prose.focus());
    await container.update({ ...STATE, settings: { ...STATE.settings, proseFont: 'Source Serif 4' } });
    expect(document.activeElement).toBe(prose);
    expect(prose.value).toBe('Source Serif 4');
  });

  it("says when the accent wasn't saved because profile.json holds an invalid hand edit", async () => {
    const { profiles } = stubBridge();
    profiles.update.mockResolvedValue({ ok: false, reason: 'invalid-file' });
    const container = await render();
    const purple = [...container.querySelectorAll<HTMLElement>('[role="option"]')].find((each) => each.querySelector('[aria-label="Purple"]'))!;
    await act(async () => purple.click());
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain('profile.json'));
  });
});

describe('SettingsView when main fails', () => {
  it("says a setting couldn't be saved, and leaves no unhandled rejection", async () => {
    const { settings } = stubBridge();
    settings.set.mockRejectedValue(new Error('boom'));
    const container = await render();
    const dark = [...row(container, 'Theme').querySelectorAll('label')].find((each) => each.textContent === 'Dark')!;
    await act(async () => dark.click());
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith("Couldn't save the setting"));
  });
});
