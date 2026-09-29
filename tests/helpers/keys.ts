import type { ElectronApplication, Page } from '@playwright/test';

/**
 * Presses CmdOrCtrl+`keyCode` (plus Shift when asked) through the window's own input path, as the
 * desktop delivers keys: main's input hook sees it. Playwright's own presses skip that hook.
 */
export async function pressInMain(app: ElectronApplication, page: Page, keyCode: string, shift = false): Promise<void> {
  const window = await app.browserWindow(page);
  await window.evaluate(
    (browserWindow, { keyCode, shift }) => {
      const modifiers: ('control' | 'meta' | 'shift')[] = [process.platform === 'darwin' ? 'meta' : 'control'];
      if (shift) modifiers.push('shift');
      browserWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      browserWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    },
    { keyCode, shift },
  );
}
