import { describe, expect, it } from 'vitest';
import { desktopEntryProblems } from './desktop-entry.mjs';

const GOOD = `[Desktop Entry]
Name=galeo
Exec=/opt/galeo/galeo -- %F
Type=Application
Icon=galeo
StartupWMClass=galeo
MimeType=text/markdown;text/x-markdown;text/plain;text/x-log;
Actions=new-window;

[Desktop Action new-window]
Name=New Window
Exec=/opt/galeo/galeo --new-window
`;

describe('desktopEntryProblems (ADR-008, SR-13)', () => {
  it('accepts the entry the packages should carry', () => {
    expect(desktopEntryProblems(GOOD)).toEqual([]);
  });

  it('wants files after `--`, as one %F field code and nothing else', () => {
    expect(desktopEntryProblems(GOOD.replace('-- %F', '%F'))).toContain('Exec must end with "-- %F": /opt/galeo/galeo %F');
    expect(desktopEntryProblems(GOOD.replace('-- %F', '-- %F %U'))).toContain('Exec must end with "-- %F": /opt/galeo/galeo -- %F %U');
  });

  it('wants every MIME type galeo reads', () => {
    expect(desktopEntryProblems(GOOD.replace('text/x-log;', ''))).toEqual(['MimeType lacks text/x-log']);
  });

  it('wants the window class and an icon', () => {
    expect(desktopEntryProblems(GOOD.replace('StartupWMClass=galeo\n', ''))).toEqual(['StartupWMClass must be galeo']);
    expect(desktopEntryProblems(GOOD.replace('Icon=galeo\n', ''))).toEqual(['no Icon']);
  });

  it('wants the New Window action listed and opening a new window without files', () => {
    expect(desktopEntryProblems(GOOD.replace('Actions=new-window;\n', ''))).toEqual(['Actions does not list new-window']);
    expect(desktopEntryProblems(GOOD.replace('--new-window', '--new-window %F'))).toEqual(['the New Window action must run --new-window, with no files']);
  });

  it('wants the action id GNOME recognises, so its dock shows one New Window item', () => {
    expect(desktopEntryProblems(GOOD.replaceAll('new-window;', 'NewWindow;').replace('Action new-window', 'Action NewWindow'))).toEqual([
      'Actions does not list new-window',
      'the New Window action must run --new-window, with no files',
    ]);
  });
});
