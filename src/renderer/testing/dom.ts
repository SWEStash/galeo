// Helpers for the renderer's component tests (not part of the app).
import { act } from 'react';

/** Puts `text` in a text field the way typing does, so React hears the change. */
export function fillInput(input: HTMLInputElement, text: string): Promise<void> {
  return act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
