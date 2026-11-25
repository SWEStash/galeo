import { describe, expect, it } from 'vitest';
import { afterToggleSource, afterToggleSplit, shownView, viewForEditing } from './view-modes';

describe('afterToggleSplit (Ctrl+\\)', () => {
  it('opens split from either single view', () => {
    expect(afterToggleSplit('rendered', { splittable: true, lastSingle: 'rendered', formatName: 'Markdown' })).toEqual({ view: 'split' });
    expect(afterToggleSplit('source', { splittable: true, lastSingle: 'source', formatName: 'Markdown' })).toEqual({ view: 'split' });
  });

  it('closes split back to the single view the reader had before', () => {
    expect(afterToggleSplit('split', { splittable: true, lastSingle: 'source', formatName: 'Markdown' })).toEqual({ view: 'source' });
    expect(afterToggleSplit('split', { splittable: true, lastSingle: 'rendered', formatName: 'Markdown' })).toEqual({ view: 'rendered' });
  });

  it('closes split back to the single view the reader had while editing too (#78)', () => {
    expect(afterToggleSplit('split', { splittable: true, lastSingle: 'rendered', formatName: 'Markdown' })).toEqual({ view: 'rendered' });
    expect(afterToggleSplit('split', { splittable: true, lastSingle: 'source', formatName: 'Markdown' })).toEqual({ view: 'source' });
  });

  it('is refused, with a reason, for formats without a split view', () => {
    expect(afterToggleSplit('source', { splittable: false, lastSingle: 'source', formatName: 'JSON' })).toEqual({
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

  it('switches between the editor and the rendered view while editing (#78)', () => {
    expect(afterToggleSource('source', { editing: true })).toEqual({ view: 'rendered' });
    expect(afterToggleSource('rendered', { editing: true })).toEqual({ view: 'source' });
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
