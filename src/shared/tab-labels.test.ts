import { describe, expect, it } from 'vitest';
import { tabLabels } from './tab-labels';

describe('tabLabels', () => {
  it('uses the file name when it is unique', () => {
    expect(tabLabels(['/r/a/plan.md', '/r/b/notes.md'])).toEqual(['plan.md', 'notes.md']);
  });

  it('adds the shortest parent that tells duplicates apart (UX F4)', () => {
    expect(tabLabels(['/w/acme/plan.md', '/w/beta/plan.md', '/w/x/notes.md'])).toEqual([
      'acme/plan.md',
      'beta/plan.md',
      'notes.md',
    ]);
  });

  it('goes up as many folders as it takes', () => {
    expect(tabLabels(['/w/acme/docs/plan.md', '/w/beta/docs/plan.md'])).toEqual(['acme/docs/plan.md', 'beta/docs/plan.md']);
  });

  it('keeps the same file open twice under the same label', () => {
    expect(tabLabels(['/w/a/plan.md', '/w/a/plan.md', '/w/b/plan.md'])).toEqual(['a/plan.md', 'a/plan.md', 'b/plan.md']);
  });

  it('reads Windows paths too', () => {
    expect(tabLabels(['C:\\w\\acme\\plan.md', 'C:\\w\\beta\\plan.md'])).toEqual(['acme/plan.md', 'beta/plan.md']);
  });
});
