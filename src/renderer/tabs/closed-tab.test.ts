import { describe, expect, it, vi } from 'vitest';
import { isClosedTab, unlessClosed } from './closed-tab';

/** How a refusal from main reaches the page: Electron wraps the handler's error. */
const fromMain = (channel: string, reason: string) => new Error(`Error invoking remote method '${channel}': Error: ${reason}`);

describe('isClosedTab', () => {
  it("knows main's refusal of a tab it no longer has", () => {
    expect(isClosedTab(fromMain('documents.read', 'unknown document'))).toBe(true);
  });

  it('takes nothing else for it', () => {
    expect(isClosedTab(fromMain('documents.read', 'not a document'))).toBe(false);
    expect(isClosedTab(fromMain('quickOpen.open', 'not offered'))).toBe(false);
    expect(isClosedTab(fromMain('documents.followLink', 'documents.followLink: invalid arguments'))).toBe(false);
    expect(isClosedTab(new Error('unknown document, and more'))).toBe(false);
    expect(isClosedTab('unknown document')).toBe(false);
  });
});

describe('unlessClosed', () => {
  it('says the message for any failure but a closed tab', () => {
    const say = vi.fn();
    unlessClosed(say, "Couldn't go back")(fromMain('documents.back', 'boom'));
    unlessClosed(say, "Couldn't go back")(fromMain('documents.back', 'unknown document'));
    expect(say.mock.calls).toEqual([["Couldn't go back"]]);
  });
});
