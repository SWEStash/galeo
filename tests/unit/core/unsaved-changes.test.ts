import { describe, expect, it } from 'vitest';
import { UnsavedChanges } from '../../../src/core/documents/unsaved';
import { FakeClock } from '../../helpers/fakes';

function setup(dirty: Record<number, string[]>, { closeAnyway = false } = {}) {
  const clock = new FakeClock();
  const asked: { window: number; ids: string[] }[] = [];
  const forced: number[] = [];
  const unsaved = new UnsavedChanges({
    dirty: (window) => dirty[window] ?? [],
    ask: (window, ids) => asked.push({ window, ids }),
    force: (window) => {
      forced.push(window);
      return Promise.resolve(closeAnyway);
    },
    clock,
    ackMs: 5000,
  });
  return { clock, asked, forced, unsaved };
}

const settled = async <T,>(promise: Promise<T>) => {
  let value: { done: boolean; result?: T } = { done: false };
  void promise.then((result) => (value = { done: true, result }));
  await Promise.resolve();
  await Promise.resolve();
  return value;
};

describe('UnsavedChanges', () => {
  it('lets windows with nothing unsaved close without asking', async () => {
    const { asked, unsaved } = setup({});
    expect(await unsaved.confirm([1, 2])).toBe(true);
    expect(asked).toEqual([]);
  });

  it('asks each window with unsaved tabs in turn, and goes ahead when every one says so', async () => {
    const { asked, unsaved } = setup({ 1: ['a'], 3: ['c', 'd'] });
    const decision = unsaved.confirm([1, 2, 3]);
    await settled(decision);
    expect(asked).toEqual([{ window: 1, ids: ['a'] }]);
    unsaved.answer(1, 'asking');
    unsaved.answer(1, 'proceed');
    await settled(decision);
    expect(asked.at(-1)).toEqual({ window: 3, ids: ['c', 'd'] });
    unsaved.answer(3, 'proceed');
    expect(await decision).toBe(true);
  });

  it('stops at the first window whose reader cancels', async () => {
    const { asked, unsaved } = setup({ 1: ['a'], 2: ['b'] });
    const decision = unsaved.confirm([1, 2]);
    await settled(decision);
    unsaved.answer(1, 'cancel');
    expect(await decision).toBe(false);
    expect(asked.map((each) => each.window)).toEqual([1]);
  });

  it('cancels when a page never says it is asking, but waits on a reader who is deciding', async () => {
    const { clock, unsaved } = setup({ 1: ['a'] });
    const hung = unsaved.confirm([1]);
    clock.advance(5000);
    expect(await hung).toBe(false);

    const deciding = unsaved.confirm([1]);
    await settled(deciding);
    unsaved.answer(1, 'asking');
    clock.advance(60_000);
    expect((await settled(deciding)).done).toBe(false);
    unsaved.answer(1, 'proceed');
    expect(await deciding).toBe(true);
  });

  it("ignores answers it didn't ask for, and a window that closed meanwhile counts as done", async () => {
    const { unsaved } = setup({ 1: ['a'] });
    unsaved.answer(1, 'proceed');
    const decision = unsaved.confirm([1]);
    await settled(decision);
    unsaved.answer(2, 'cancel');
    expect((await settled(decision)).done).toBe(false);
    unsaved.closeWindow(1);
    expect(await decision).toBe(true);
  });

  it("asks main's own question, not the page again, when a window still deciding is closed again", async () => {
    const { asked, forced, unsaved } = setup({ 1: ['a'] });
    const first = unsaved.confirm([1]);
    await settled(first);
    unsaved.answer(1, 'asking');
    expect(await unsaved.confirm([1])).toBe(false);
    expect(forced).toEqual([1]);
    expect(asked).toHaveLength(1);
    expect((await settled(first)).done).toBe(false);
    unsaved.answer(1, 'cancel');
    expect(await first).toBe(false);
  });

  it('closes a window whose page holds the question open once the reader says so in main\'s question', async () => {
    const { forced, unsaved } = setup({ 1: ['a'] }, { closeAnyway: true });
    const first = unsaved.confirm([1]);
    await settled(first);
    unsaved.answer(1, 'asking');
    expect(await unsaved.confirm([1])).toBe(true);
    expect(await first).toBe(true);
    expect(forced).toEqual([1]);
  });

  it("asks the page again, not main's question, when it never said it was asking", async () => {
    const { asked, forced, unsaved } = setup({ 1: ['a'] });
    void unsaved.confirm([1]);
    await Promise.resolve();
    void unsaved.confirm([1]);
    await Promise.resolve();
    expect(asked).toHaveLength(2);
    expect(forced).toEqual([]);
  });
});
