import { describe, expect, it } from 'vitest';
import { lineAtOffset, offsetOfLine, syncScrolling, type SyncBlock, type SyncPane } from './scroll-sync';

// A heading, a paragraph, a 10-line code block, then a quote holding a paragraph (nested blocks).
const blocks: SyncBlock[] = [
  { line: 1, end: 1, top: 0, bottom: 40 },
  { line: 3, end: 3, top: 60, bottom: 100 },
  { line: 5, end: 14, top: 120, bottom: 320 },
  { line: 20, end: 22, top: 420, bottom: 500 },
  { line: 20, end: 21, top: 420, bottom: 470 },
];

describe('lineAtOffset', () => {
  it('is the first line of a block at its top', () => {
    expect(lineAtOffset(blocks, 0)).toBe(1);
    expect(lineAtOffset(blocks, 120)).toBe(5);
  });

  it('follows a long block proportionally inside it', () => {
    expect(lineAtOffset(blocks, 20)).toBeCloseTo(1.5);
    expect(lineAtOffset(blocks, 220)).toBeCloseTo(10);
  });

  it('spreads the lines between two blocks over the space between them', () => {
    expect(lineAtOffset(blocks, 50)).toBeCloseTo(2.5);
    expect(lineAtOffset(blocks, 370)).toBeCloseTo(17.5);
  });

  it('takes the innermost of nested blocks', () => {
    expect(lineAtOffset(blocks, 445)).toBeCloseTo(21);
  });

  it('stays at the last line past the end, and at the first without blocks', () => {
    expect(lineAtOffset(blocks, 900)).toBe(23);
    expect(lineAtOffset([], 100)).toBe(1);
  });
});

describe('offsetOfLine', () => {
  it('is the inverse of lineAtOffset inside the content', () => {
    for (const y of [0, 20, 50, 120, 220, 319, 370, 445]) expect(offsetOfLine(blocks, lineAtOffset(blocks, y))).toBeCloseTo(y);
  });

  it('stops at the content’s ends', () => {
    expect(offsetOfLine(blocks, 0.5)).toBe(0);
    expect(offsetOfLine(blocks, 40)).toBe(500);
    expect(offsetOfLine([], 3)).toBe(0);
  });
});

describe('syncScrolling', () => {
  /** A pane whose own scroll event follows each move, as a real scroller's does. */
  function pane(): SyncPane & { line: number; moves: number[] } {
    const scroller = document.createElement('div');
    const self = {
      scroller,
      line: 1,
      moves: [] as number[],
      position: () => self.line,
      scrollTo: (line: number) => {
        self.line = line;
        self.moves.push(line);
        scroller.dispatchEvent(new Event('scroll'));
      },
    };
    return self;
  }

  function setup() {
    const frames: (() => void)[] = [];
    const flush = (count = 1) => {
      for (let i = 0; i < count; i++) frames.splice(0).forEach((run) => run());
    };
    const source = pane();
    const rendered = pane();
    const sync = syncScrolling({ source, rendered }, (run) => frames.push(run));
    const scroll = (target: ReturnType<typeof pane>, line: number) => {
      target.line = line;
      target.scroller.dispatchEvent(new Event('scroll'));
    };
    return { frames, flush, source, rendered, sync, scroll };
  }

  it('moves the other pane to the scrolled one’s place on the next frame, once per frame', () => {
    const { flush, source, rendered, scroll } = setup();
    scroll(rendered, 7);
    scroll(rendered, 9.5);
    expect(source.moves).toEqual([]);
    flush();
    expect(source.moves).toEqual([9.5]);
  });

  it('never lets the follower’s own scrolling drive the leader back', () => {
    const { flush, source, rendered, scroll } = setup();
    scroll(rendered, 12);
    flush(5);
    expect(source.moves).toEqual([12]);
    expect(rendered.moves).toEqual([]);
  });

  it('lets the other pane lead once the follower has settled', () => {
    const { flush, source, rendered, scroll } = setup();
    scroll(rendered, 12);
    flush(5);
    scroll(source, 30);
    flush();
    expect(rendered.moves).toEqual([30]);
  });

  it('lets a follower moved elsewhere while it settled lead once it has settled', () => {
    const { flush, source, rendered, scroll } = setup();
    scroll(rendered, 12);
    flush();
    // Not the reader's input: a scroll the page made (find, the outline) before the follower settled.
    scroll(source, 30);
    flush(5);
    expect(rendered.moves).toEqual([30]);
  });

  it('hands the lead over at once when the reader acts on the follower', () => {
    const { flush, source, rendered, scroll } = setup();
    scroll(rendered, 12);
    flush();
    source.scroller.dispatchEvent(new Event('wheel'));
    scroll(source, 4);
    flush();
    expect(rendered.moves).toEqual([4]);
  });

  it('puts a pane whose content changed back on the leader’s line, its own scrolling meanwhile ignored', () => {
    const { flush, source, rendered, sync, scroll } = setup();
    scroll(source, 8);
    flush(5);
    sync.refresh(rendered);
    // Keeping its place through new content scrolls it: that isn't the reader.
    rendered.scroller.dispatchEvent(new Event('scroll'));
    flush(5);
    expect(rendered.moves).toEqual([8, 8]);
    expect(source.moves).toEqual([]);
  });

  it('leaves a leading pane whose content changed where it is, and the other pane too', () => {
    const { flush, source, rendered, sync, scroll } = setup();
    scroll(rendered, 8);
    flush(5);
    sync.refresh(rendered);
    rendered.scroller.dispatchEvent(new Event('scroll'));
    flush(5);
    expect(rendered.moves).toEqual([]);
    expect(source.moves).toEqual([8]);
  });

  it('stops listening when stopped', () => {
    const { flush, source, rendered, sync, scroll } = setup();
    sync.stop();
    scroll(rendered, 12);
    flush();
    expect(source.moves).toEqual([]);
  });
});
