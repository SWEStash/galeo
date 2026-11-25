import { describe, expect, it } from 'vitest';
import { editToggle, replaceKey } from './edit-toggle';

describe('editToggle (ADR-015)', () => {
  it('leaves edit mode when the tab already has a grant', () => {
    expect(editToggle({ granted: true, text: true, chosen: false })).toBe('leave');
  });

  it("refuses a file main hasn't read as text with content: missing, empty, binary, too large", () => {
    expect(editToggle({ granted: false, text: false, chosen: true })).toBe('refuse');
  });

  it("grants a text file the reader handed over, and asks first for any other", () => {
    expect(editToggle({ granted: false, text: true, chosen: true })).toBe('grant');
    expect(editToggle({ granted: false, text: true, chosen: false })).toBe('ask');
  });
});

describe('replaceKey (ADR-038)', () => {
  it('leaves Ctrl+H to the page in edit mode: it opens replace there', () => {
    expect(replaceKey({ granted: true, text: true, chosen: true })).toBe('page');
  });

  it('asks for edit mode on a reading tab as Ctrl+E does, and never leaves it', () => {
    expect(replaceKey({ granted: false, text: false, chosen: true })).toBe('refuse');
    expect(replaceKey({ granted: false, text: true, chosen: true })).toBe('grant');
    expect(replaceKey({ granted: false, text: true, chosen: false })).toBe('ask');
  });
});
