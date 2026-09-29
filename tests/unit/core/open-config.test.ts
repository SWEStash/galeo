import { describe, expect, it } from 'vitest';
import { openConfigFile } from '../../../src/core/settings/open-config';
import { utf8 } from '../../../src/main/adapters/utf8';
import { FakeFileSystem, FakeOsShell } from '../../helpers/fakes';

const CSS = '/cfg/profiles/acme/custom.css';
const opened = (shell: FakeOsShell) => shell.calls.filter((call) => call.method === 'openPath').map((call) => call.target);

describe('openConfigFile ("Open custom CSS", a notice\'s "Open file")', () => {
  it('opens an existing file in its default app', async () => {
    const fs = new FakeFileSystem({ [CSS]: 'p {}' });
    const shell = new FakeOsShell();
    await openConfigFile({ fs, shell, utf8 }, CSS);
    expect(opened(shell)).toEqual([CSS]);
  });

  it('creates a missing file first from its template, owner-only, then opens it', async () => {
    const fs = new FakeFileSystem();
    const shell = new FakeOsShell();
    await openConfigFile({ fs, shell, utf8 }, CSS, '/* galeo */\n');
    expect(new TextDecoder().decode(await fs.readFile(CSS, { maxBytes: 1e6 }))).toBe('/* galeo */\n');
    expect(fs.modeOf(CSS)).toBe(0o600);
    expect(fs.modeOf('/cfg/profiles/acme')).toBe(0o700);
    expect(opened(shell)).toEqual([CSS]);
  });

  it('never replaces a file that exists', async () => {
    const fs = new FakeFileSystem({ [CSS]: 'mine' });
    await openConfigFile({ fs, shell: new FakeOsShell(), utf8 }, CSS, 'template');
    expect(new TextDecoder().decode(await fs.readFile(CSS, { maxBytes: 1e6 }))).toBe('mine');
  });

  it('refuses what must not be opened: an executable, a folder, a missing file without a template (SR-05)', async () => {
    const fs = new FakeFileSystem({ [CSS]: 'p {}', '/cfg/settings.json/x': '' });
    fs.makeExecutable(CSS);
    const shell = new FakeOsShell();
    await expect(openConfigFile({ fs, shell, utf8 }, CSS)).rejects.toThrow(/not opened/);
    await expect(openConfigFile({ fs, shell, utf8 }, '/cfg/settings.json')).rejects.toThrow(/not opened/);
    await expect(openConfigFile({ fs, shell, utf8 }, '/cfg/missing.json')).rejects.toThrow();
    expect(opened(shell)).toEqual([]);
  });
});
