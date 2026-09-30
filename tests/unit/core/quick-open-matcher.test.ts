import { describe, expect, it } from 'vitest';
import { indexPaths, matchPath, topMatches } from '../../../src/core/quick-open/matcher';

const ranked = (query: string, paths: string[]) => topMatches(query, paths, 10).map((match) => match.path);

describe('matchPath', () => {
  it('matches the query as a subsequence, ignoring case and spaces, and says where', () => {
    expect(matchPath('rdme', 'docs/README.md')?.positions).toEqual([5, 8, 9, 10]);
    expect(matchPath('READ me', 'docs/readme.md')).not.toBeNull();
    expect(matchPath('xyz', 'docs/readme.md')).toBeNull();
    expect(matchPath('mdr', 'docs/readme.md')).toBeNull();
  });
});

describe('topMatches', () => {
  it('ranks a match in the file name above one spread over the folders', () => {
    expect(ranked('plan', ['plans/old/notes.md', 'docs/plan.md'])).toEqual(['docs/plan.md', 'plans/old/notes.md']);
    expect(ranked('plan', ['plan/old/notes.md', 'docs/archive/plan.md'])).toEqual(['docs/archive/plan.md', 'plan/old/notes.md']);
    expect(ranked('read', ['src/reader/index.ts', 'README.md'])).toEqual(['README.md', 'src/reader/index.ts']);
  });

  it('ranks letters in a row above the same letters apart', () => {
    expect(ranked('abc', ['x/axbxc.md', 'x/abcd.md'])).toEqual(['x/abcd.md', 'x/axbxc.md']);
    // Even over letters that each start a word.
    expect(ranked('plan', ['x/p-l-a-n.md', 'x/planner.md'])).toEqual(['x/planner.md', 'x/p-l-a-n.md']);
  });

  it('ranks letters that start words above letters inside them', () => {
    expect(ranked('fb', ['xfyb.md', 'foo-bar.md'])).toEqual(['foo-bar.md', 'xfyb.md']);
    expect(ranked('ob', ['fooxbar.md', 'foo-bar.md'])).toEqual(['foo-bar.md', 'fooxbar.md']);
    expect(ranked('pc', ['epic.md', 'plan/checkpoints.md'])).toEqual(['plan/checkpoints.md', 'epic.md']);
    expect(ranked('ep', ['sleep.md', 'executionPlan.md'])).toEqual(['executionPlan.md', 'sleep.md']);
  });

  it('prefers the shorter path when everything else is equal', () => {
    expect(ranked('a', ['deep/folder/a.md', 'a.md'])).toEqual(['a.md', 'deep/folder/a.md']);
  });

  it('keeps the given order for an empty query, up to the limit', () => {
    expect(topMatches('', ['b.md', 'a.md', 'c.md'], 2).map((match) => match.path)).toEqual(['b.md', 'a.md']);
  });

  it('keeps only the best `limit` matches', () => {
    const paths = Array.from({ length: 100 }, (_, n) => `d${n}/plan-${n}.md`);
    expect(topMatches('plan', paths, 5)).toHaveLength(5);
  });

  it('ranks 100,000 paths in well under the time a keystroke allows', () => {
    const words = ['plan', 'notes', 'index', 'readme', 'agent', 'config', 'docs', 'src', 'test', 'build'];
    const paths = Array.from({ length: 100_000 }, (_, n) => `${words[n % 10]}/${words[(n * 7) % 10]}-${n}/${words[(n * 3) % 10]}${n}.md`);
    const index = indexPaths(paths);
    const times: number[] = [];
    for (const query of ['plan', 'rdme', 'a', 'cfgidx', 'zzz']) {
      const start = performance.now();
      topMatches(query, index, 50);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    // The median of five queries; generous for a loaded test machine (the target is ~50 ms).
    expect(times[2]).toBeLessThan(250);
  });
});
