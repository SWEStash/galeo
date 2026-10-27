import { act, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { useLatest } from './useLatest';

describe('useLatest', () => {
  it('keeps one ref whose value is the last one rendered', async () => {
    const seen: RefObject<string>[] = [];
    function Probe({ value }: { value: string }) {
      seen.push(useLatest(value));
      return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(<Probe value="first" />));
    await act(async () => root.render(<Probe value="second" />));
    expect(seen[1]).toBe(seen[0]);
    expect(seen[0]!.current).toBe('second');
    act(() => root.unmount());
  });
});
