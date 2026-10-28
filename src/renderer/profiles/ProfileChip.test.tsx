import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCENTS } from '../../shared/accents';
import type { ProfilesState } from '../../shared/contracts';
import { CommandsProvider } from '../commands/useCommands';
import { ProfileChip } from './ProfileChip';
import { fillInput } from '../testing/dom';

const STATE: ProfilesState = {
  current: 'acme',
  profiles: [
    { id: 'default', name: 'default', accent: null, running: true },
    { id: 'acme', name: 'Acme', accent: ACCENTS[2]!.color, running: true },
    { id: 'beta', name: 'Beta', accent: null, running: false },
  ],
};

let roots: Root[] = [];
const say = vi.fn();

function stubBridge() {
  const profiles = {
    open: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({ ok: true }),
    update: vi.fn().mockResolvedValue({ ok: true }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const session = { previous: vi.fn().mockResolvedValue([]), restorePrevious: vi.fn().mockResolvedValue(undefined) };
  Object.defineProperty(window, 'galeo', { value: { profiles, session }, configurable: true });
  return { profiles, session };
}

async function render(state: ProfilesState = STATE, onAbout: () => void = () => {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <CommandsProvider platform="linux">
        <ProfileChip state={state} onAbout={onAbout} say={say} />
      </CommandsProvider>,
    ),
  );
  return container;
}

const chip = (container: HTMLElement) => container.querySelector<HTMLButtonElement>('[data-testid="profile-chip"]')!;
const menuItem = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent?.includes(name));
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
const button = (root: ParentNode, name: string) => [...root.querySelectorAll('button')].find((each) => each.textContent === name)!;

async function openMenu(container: HTMLElement) {
  await act(async () => chip(container).click());
  await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull());
}

async function type(input: HTMLInputElement, value: string) {
  await fillInput(input, value);
}

afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = '';
  say.mockReset();
});

describe('ProfileChip (UX F5)', () => {
  it('names the profile, with its accent beside the name, never the colour alone', async () => {
    stubBridge();
    const container = await render();
    expect(chip(container).textContent).toContain('Acme');
    expect(chip(container).getAttribute('aria-label')).toBe('Profile: Acme');
    const swatch = container.querySelector<HTMLElement>('.profile-chip-swatch')!;
    expect(swatch.style.background).toBe(ACCENTS[2]!.color);
    expect(swatch.getAttribute('aria-hidden')).toBe('true');
  });

  it('lists every profile, saying which run, and switches to one', async () => {
    const { profiles } = stubBridge();
    const container = await render();
    await openMenu(container);
    expect(menuItem('Beta')?.textContent).toContain('Not open');
    expect(menuItem('default')?.textContent).toContain('Open');
    // Its name says what it shows, so a voice command naming the visible text finds it.
    const labelledBy = menuItem('Beta')!.getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelledBy)?.textContent).toBe('Beta Not open');
    await act(async () => menuItem('Beta')!.click());
    expect(profiles.open).toHaveBeenCalledWith('beta');
  });

  it('opens About galeo from the menu', async () => {
    stubBridge();
    const onAbout = vi.fn();
    const container = await render(STATE, onAbout);
    await openMenu(container);
    await act(async () => menuItem('About galeo')!.click());
    expect(onAbout).toHaveBeenCalledTimes(1);
  });

  it('opens the menu on Ctrl+Shift+M', async () => {
    stubBridge();
    await render();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', ctrlKey: true, shiftKey: true, bubbles: true })));
    await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull());
  });

  it('creates a profile with a name and a preset accent', async () => {
    const { profiles } = stubBridge();
    const container = await render();
    await openMenu(container);
    await act(async () => menuItem('New profile')!.click());
    const form = await vi.waitFor(() => dialog()!);
    expect(form.querySelector('h2')?.textContent).toBe('New profile');
    await type(form.querySelector<HTMLInputElement>('input[name="name"]')!, 'Client X');
    const swatches = [...form.querySelectorAll<HTMLElement>('[role="option"], [role="radio"]')];
    expect(swatches).toHaveLength(8);
    // Each option is named by its swatch (name from content): the preset's name, not a colour code.
    expect(swatches[4]!.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Orange');
    await act(async () => swatches[4]!.click());
    await act(async () => button(form, 'Create').click());
    expect(profiles.create).toHaveBeenCalledWith('Client X', ACCENTS[4]!.color);
    await vi.waitFor(() => expect(dialog()).toBeNull());
  });

  it('keeps the dialog open and says why when main refuses the name', async () => {
    const { profiles } = stubBridge();
    profiles.create.mockResolvedValue({ ok: false, reason: 'taken' });
    const container = await render();
    await openMenu(container);
    await act(async () => menuItem('New profile')!.click());
    const form = await vi.waitFor(() => dialog()!);
    await type(form.querySelector<HTMLInputElement>('input[name="name"]')!, 'beta');
    await act(async () => button(form, 'Create').click());
    await vi.waitFor(() => expect(form.textContent).toContain('Another profile has this name'));
    expect(dialog()).not.toBeNull();
  });

  it('edits the profile, starting from its name and accent', async () => {
    const { profiles } = stubBridge();
    const container = await render();
    await openMenu(container);
    await act(async () => menuItem('Edit profile')!.click());
    const form = await vi.waitFor(() => dialog()!);
    const name = form.querySelector<HTMLInputElement>('input[name="name"]')!;
    expect(name.value).toBe('Acme');
    await type(name, 'Acme EU');
    await act(async () => button(form, 'Save').click());
    expect(profiles.update).toHaveBeenCalledWith('Acme EU', ACCENTS[2]!.color);
  });

  it('deletes only after a confirmation naming what is lost', async () => {
    const { profiles } = stubBridge();
    const container = await render();
    await openMenu(container);
    await act(async () => menuItem('Delete profile')!.click());
    const confirm = await vi.waitFor(() => dialog()!);
    expect(confirm.getAttribute('role')).toBe('alertdialog');
    expect(confirm.textContent).toContain("Delete profile 'Acme'?");
    expect(confirm.textContent).toContain("the profile's session and settings; your files are not touched");
    await act(async () => button(confirm, 'Delete').click());
    expect(profiles.delete).toHaveBeenCalled();
  });

  it('never offers to delete default', async () => {
    stubBridge();
    const container = await render({ ...STATE, current: 'default' });
    await openMenu(container);
    expect(menuItem('Delete profile')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('restores a previous session of the profile', async () => {
    const { session } = stubBridge();
    session.previous.mockResolvedValue([{ snapshot: 1, savedAt: 0, windows: 1, tabs: 3 }]);
    const container = await render();
    await openMenu(container);
    await vi.waitFor(() => expect(menuItem('3 tabs')).toBeDefined());
    const labelledBy = menuItem('3 tabs')!.getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelledBy)?.textContent).toMatch(/ 3 tabs$/);
    await act(async () => menuItem('3 tabs')!.click());
    expect(session.restorePrevious).toHaveBeenCalledWith(1);
  });

  it('says so in the dialog when main could not save the profile at all', async () => {
    const { profiles } = stubBridge();
    profiles.create.mockRejectedValue(new Error('no profile'));
    const container = await render();
    await openMenu(container);
    await act(async () => menuItem('New profile')!.click());
    const form = await vi.waitFor(() => dialog()!);
    await act(async () => button(form, 'Create').click());
    await vi.waitFor(() => expect(form.querySelector('[role="alert"]')?.textContent).toContain("couldn't be saved"));
    expect(dialog()).not.toBeNull();
  });
});

describe('ProfileChip when main fails', () => {
  it("says the profile couldn't be opened, and leaves no unhandled rejection", async () => {
    const { profiles } = stubBridge();
    profiles.open.mockRejectedValue(new Error('boom'));
    const container = await render();
    await openMenu(container);
    await act(async () => menuItem('Beta')!.click());
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith("Couldn't open the profile"));
  });
});
