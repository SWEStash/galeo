import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChangedRanges } from './change-ranges';
import { useChangeMarks, type ChangeMarkInput } from './useChangeMarks';

let root: Root | undefined;
let id = 0;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

/** Renders the hook with `input`, and returns a way to change it and to read its latest answer. */
async function mounted(input: Omit<ChangeMarkInput, 'tabId'>) {
  const tabId = `tab-${++id}`;
  let latest: ReturnType<typeof useChangeMarks> | null = null;
  function Probe(props: ChangeMarkInput) {
    latest = useChangeMarks(props);
    return null;
  }
  const container = document.createElement('div');
  root = createRoot(container);
  let props: ChangeMarkInput = { tabId, ...input };
  const render = async (change: Partial<ChangeMarkInput>) => {
    props = { ...props, ...change };
    await act(async () => root!.render(<Probe {...props} />));
  };
  await render({});
  return { render, now: () => latest! };
}

const doc = (...lines: string[]) => `${lines.join('\n')}\n`;
/** Waits for the diff, which loads lazily. */
const settled = (now: () => ReturnType<typeof useChangeMarks>, check: (ranges: ChangedRanges | null) => void) =>
  vi.waitFor(() => check(now().ranges));

describe('useChangeMarks', () => {
  it('shows no marks on the first look, then marks what changed while the tab stays shown, adding up', async () => {
    const { render, now } = await mounted({ version: null, path: '/a.md', text: doc('a', 'b', 'c'), active: true, editing: false, encoding: 'utf-8' });
    expect(now().ranges).toBeNull();
    await render({ text: doc('a', 'B', 'c') });
    await settled(now, (ranges) => expect(ranges?.changed).toEqual([[2, 2]]));
    await render({ text: doc('a', 'B', 'C') });
    await settled(now, (ranges) => expect(ranges?.changed).toEqual([[2, 3]]));
  });

  it('marks, on return, only what changed since the reader left', async () => {
    const { render, now } = await mounted({ version: null, path: '/a.md', text: doc('a', 'b'), active: true, editing: false, encoding: 'utf-8' });
    await render({ text: doc('A', 'b') });
    await render({ active: false });
    await render({ text: doc('A', 'B') });
    await render({ active: true });
    await settled(now, (ranges) => expect(ranges?.changed).toEqual([[2, 2]]));
  });

  it('clears on request, taking the shown text as the baseline', async () => {
    const { render, now } = await mounted({ version: null, path: '/a.md', text: doc('a'), active: true, editing: false, encoding: 'utf-8' });
    await render({ text: doc('b') });
    await settled(now, (ranges) => expect(ranges).not.toBeNull());
    act(() => now().clear());
    expect(now().ranges).toBeNull();
    await render({ text: doc('b', 'c') });
    await settled(now, (ranges) => expect(ranges?.changed).toEqual([[2, 2]]));
  });

  it("shows no marks in edit mode, and never marks the reader's own edits after it", async () => {
    const { render, now } = await mounted({ version: null, path: '/a.md', text: doc('a'), active: true, editing: false, encoding: 'utf-8' });
    await render({ editing: true });
    await render({ text: doc('mine') });
    expect(now().ranges).toBeNull();
    await render({ editing: false });
    await render({ text: doc('mine', 'theirs') });
    await settled(now, (ranges) => expect(ranges?.changed).toEqual([[2, 2]]));
  });

  it("takes the reader's own write as seen: the version it saved is the new baseline, unmarked", async () => {
    const { render, now } = await mounted({ path: '/a.md', text: doc('- [ ] a', '- [ ] b'), version: 'v1', active: true, editing: false, encoding: 'utf-8' });
    act(() => now().acceptNext('v2'));
    await render({ text: doc('- [x] a', '- [ ] b'), version: 'v2' });
    expect(now().ranges).toBeNull();
    await render({ text: doc('- [x] a', '- [x] b'), version: 'v3' });
    await settled(now, (ranges) => expect(ranges?.changed).toEqual([[2, 2]]));
  });

  it('still marks a change that landed before the reread of the reader\'s own write', async () => {
    const { render, now } = await mounted({ path: '/a.md', text: doc('- [ ] a', 'b'), version: 'v1', active: true, editing: false, encoding: 'utf-8' });
    act(() => now().acceptNext('v2'));
    // An agent wrote after the tick was saved: the reread is v3, not the tick's v2.
    await render({ text: doc('- [x] a', 'B'), version: 'v3' });
    await settled(now, (ranges) => expect(ranges?.changed).toEqual([[1, 2]]));
  });

  it('starts again, unmarked, when the file is read in another encoding', async () => {
    const { render, now } = await mounted({ version: null, path: '/a.md', text: doc('a'), active: true, editing: false, encoding: 'utf-8' });
    await render({ text: doc('ä'), encoding: 'windows-1252' });
    expect(now().ranges).toBeNull();
    await render({ text: doc('ä', 'b') });
    await settled(now, (ranges) => expect(ranges?.changed).toEqual([[2, 2]]));
  });

  it('says a document too large to mark changed, once it changes, until it is looked at again', async () => {
    const big = 'x'.repeat(2_000_001);
    const { render, now } = await mounted({ version: null, path: '/a.md', text: big, active: true, editing: false, encoding: 'utf-8' });
    expect(now().tooLarge).toBe(false);
    await render({ text: `${big}y` });
    expect(now().tooLarge).toBe(true);
    act(() => now().clear());
    expect(now().tooLarge).toBe(false);
  });
});
