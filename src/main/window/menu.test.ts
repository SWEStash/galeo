import { describe, expect, it } from 'vitest';
import { applicationMenu } from './menu';

describe('applicationMenu', () => {
  it.each(['linux', 'win32'] as const)('is none on %s, so no default accelerator (Ctrl+W, Ctrl+R) beats the page', (platform) => {
    expect(applicationMenu(platform)).toBeNull();
  });

  it("keeps macOS's app and edit menus only: copy, paste and quit work, nothing closes or reloads a window", () => {
    expect(applicationMenu('darwin')).toEqual([{ role: 'appMenu' }, { role: 'editMenu' }]);
  });
});
