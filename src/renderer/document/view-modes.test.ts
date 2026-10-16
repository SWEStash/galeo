import { describe, expect, it } from 'vitest';
import { afterToggleSource, afterToggleSplit, shownView, viewForEditing } from './view-modes';

describe('afterToggleSplit (Ctrl+\\)', () => {
  it('opens split from either single view', () => {
    expect(afterToggleSplit('rendered', { splittable: true, editing: false, lastSingle: 'rendered', formatName: 'Markdown' })).toEqual({ view: 'split' });
    expect(afterToggleSplit('source', { splittable: true, editing: true, lastSingle: 'source', formatName: 'Markdown' })).toEqual({ view: 'split' });
  });

  it('closes split back to the single view the reader had before', () => {
    expect(afterToggleSplit('split', { splittable: true, editing: false, lastSingle: 'source', formatName: 'Markdown' })).toEqual({ view: 'source' });
    expect(afterToggleSplit('split', { splittable: true, editing: false, lastSingle: 'rendered', formatName: 'Markdown' })).toEqual({ view: 'rendered' });
  });

  it('closes split to the source while editing, where the rendered view is not offered', () => {
    expect(afterToggleSplit('split', { splittable: true, editing: true, lastSingle: 'rendered', formatName: 'Markdown' })).toEqual({ view: 'source' });
  });

  it('is refused, with a reason, for formats without a split view', () => {
    expect(afterToggleSplit('source', { splittable: false, editing: false, lastSingle: 'source', formatName: 'JSON' })).toEqual({
      refused: 'No split view for JSON files',
    });
  });
});

describe('afterToggleSource (Ctrl+U)', () => {
  it('switches between the single views when reading', () => {
    expect(afterToggleSource('rendered', { editing: false })).toEqual({ view: 'source' });
    expect(afterToggleSource('source', { editing: false })).toEqual({ view: 'rendered' });
  });

  it('leaves split for the rendered view when reading and for the source while editing', () => {
    expect(afterToggleSource('split', { editing: false })).toEqual({ view: 'rendered' });
    expect(afterToggleSource('split', { editing: true })).toEqual({ view: 'source' });
  });

  it('keeps the editor in a single view while editing, saying how to see the rendered view', () => {
    expect(afterToggleSource('source', { editing: true })).toEqual({ refused: 'Leave edit mode (Ctrl+E) to see the rendered view' });
  });
});

describe('viewForEditing', () => {
  it('keeps split when edit mode starts, and otherwise shows the source', () => {
    expect(viewForEditing('split')).toBe('split');
    expect(viewForEditing('rendered')).toBe('source');
    expect(viewForEditing('source')).toBe('source');
  });
});

describe('shownView', () => {
  it('shows split only when the window is wide enough', () => {
    expect(shownView('split', { narrow: false, editing: false })).toBe('split');
    expect(shownView('split', { narrow: true, editing: false })).toBe('rendered');
  });

  it('shows the text being typed when a narrow window holds an edited split', () => {
    expect(shownView('split', { narrow: true, editing: true })).toBe('source');
  });

  it('leaves single views as they are', () => {
    expect(shownView('source', { narrow: true, editing: false })).toBe('source');
    expect(shownView('rendered', { narrow: true, editing: true })).toBe('rendered');
  });
});
