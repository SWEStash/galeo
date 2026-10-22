import path from 'node:path';
import { expect, type Page } from '@playwright/test';

/** Tab and file drags for the e2e specs: trusted drops through the DevTools protocol, and a real mouse drag of a tab. */

export const TAB_TYPE = 'application/x-galeo-tab';

/**
 * Drops files the way a file manager does: a trusted drag sequence carrying real file paths,
 * through the DevTools protocol (page script can only make untrusted events).
 */
export async function dropFiles(window: Page, files: string[], at: { x: number; y: number }) {
  const session = await window.context().newCDPSession(window);
  const data = { items: [], files, dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
    await session.send('Input.dispatchDragEvent', { type, x: at.x, y: at.y, data });
  }
  await session.detach();
}

/** Drops a tab on the window the way another galeo window's drag does: a trusted drop carrying `data`, the drag's token (ADR-022). */
export async function dropTab(window: Page, data: string, at: { x: number; y: number }) {
  const session = await window.context().newCDPSession(window);
  const drag = { items: [{ mimeType: TAB_TYPE, data }], dragOperationsMask: 16 };
  for (const type of ['dragEnter', 'dragOver', 'drop'] as const) await session.send('Input.dispatchDragEvent', { type, x: at.x, y: at.y, data: drag });
  await session.detach();
}

/**
 * Starts dragging the tab with the mouse from near its top edge, away from its name, and holds it.
 * Resolves with the token the drag carries, read from its own dragstart.
 */
export async function startDragging(window: Page, file: string): Promise<string> {
  // What the page writes into the drag, as it writes it: once the drag has started, its data can't be read.
  await window.evaluate((type) => {
    const seen = globalThis as { __galeoDragToken?: string; __galeoDragWatch?: boolean };
    delete seen.__galeoDragToken;
    if (seen.__galeoDragWatch) return;
    seen.__galeoDragWatch = true;
    const setData = DataTransfer.prototype.setData;
    DataTransfer.prototype.setData = function (format, data) {
      if (format === type) seen.__galeoDragToken = data;
      return setData.call(this, format, data);
    };
    const add = DataTransferItemList.prototype.add as (data: string, type: string) => DataTransferItem | null;
    DataTransferItemList.prototype.add = function (this: DataTransferItemList, data: string | File, format?: string) {
      if (typeof data === 'string' && format === type) seen.__galeoDragToken = data;
      return (add as (...args: unknown[]) => DataTransferItem | null).call(this, data, format);
    } as typeof DataTransferItemList.prototype.add;
  }, TAB_TYPE);
  // The part of the tab that starts a drag: all of a tab in the bar, a row's inside in the side panel.
  const grab = window.getByRole('tab', { name: new RegExp(path.basename(file)) }).locator('.tab-grab');
  const box = (await grab.boundingBox())!;
  await window.mouse.move(box.x + 6, box.y + 3);
  await window.mouse.down();
  await window.mouse.move(box.x + 46, box.y + 8, { steps: 5 });
  const token = () => window.evaluate(() => (globalThis as { __galeoDragToken?: string }).__galeoDragToken ?? '');
  await expect.poll(token).toMatch(/^[0-9a-f-]{36}$/);
  return token();
}

/** The pointer crosses the window's edge over `selector`: a drop target there keeps the event to itself. */
export async function crossEdge(window: Page, type: 'dragleave' | 'dragenter', selector: string) {
  await window.evaluate(
    ({ type, selector }) => {
      const edge = new DragEvent(type, { bubbles: true });
      Object.defineProperty(edge, 'relatedTarget', { value: null });
      document.querySelector(selector)!.dispatchEvent(edge);
    },
    { type, selector },
  );
}

/** Ends the window's drag of the tab named `name` as a drop elsewhere does: the pointer left the window, and something may have taken it. */
export async function endDrag(window: Page, name: string, dropEffect: 'none' | 'copy' | 'move') {
  await window.evaluate(
    ({ name, dropEffect }) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.dropEffect = dropEffect;
      const label = [...document.querySelectorAll('.tab-label')].find((each) => each.textContent === name)!;
      label.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
    },
    { name, dropEffect },
  );
}

export async function endDragOutside(window: Page, name: string, dropEffect: 'none' | 'copy', across = '.drop-area') {
  await crossEdge(window, 'dragleave', across);
  await endDrag(window, name, dropEffect);
}
