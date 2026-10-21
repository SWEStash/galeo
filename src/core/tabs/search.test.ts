import { describe, expect, it } from 'vitest';
import { searchTabs } from './search';

const HOME = '/home/me';
const open = [
  { id: 't1', path: `${HOME}/git/acme/README.md` },
  { id: 't2', path: `${HOME}/git/acme/docs/plan.md` },
  { id: 't3', path: '/srv/logs/app.log' },
];
const closed = [
  { id: 'c1', path: `${HOME}/notes/today.md` },
  { id: 'c2', path: `${HOME}/git/beta/plan.md` },
];

describe('searchTabs', () => {
  it('lists every tab for an empty query: open ones in tab order, closed ones newest first, with name and folder', () => {
    expect(searchTabs('', open, closed, HOME)).toEqual({
      query: '',
      open: [
        { id: 't1', name: 'README.md', detail: '~/git/acme' },
        { id: 't2', name: 'plan.md', detail: '~/git/acme/docs' },
        { id: 't3', name: 'app.log', detail: '/srv/logs' },
      ],
      closed: [
        { id: 'c1', name: 'today.md', detail: '~/notes' },
        { id: 'c2', name: 'plan.md', detail: '~/git/beta' },
      ],
    });
  });

  it('matches the name and the path as shown, best first, in each section', () => {
    const results = searchTabs('plan', open, closed, HOME);
    expect(results.open.map((hit) => hit.id)).toEqual(['t2']);
    expect(results.closed.map((hit) => hit.id)).toEqual(['c2']);
    expect(searchTabs('beta', open, closed, HOME).closed.map((hit) => hit.id)).toEqual(['c2']);
    expect(searchTabs('~/git/acme', open, closed, HOME).open.map((hit) => hit.id)).toEqual(['t1', 't2']);
    expect(searchTabs('nothing', open, closed, HOME)).toEqual({ query: 'nothing', open: [], closed: [] });
  });

  it('lists two tabs of the same file each, by their own ids', () => {
    const twice = [...open, { id: 't4', path: `${HOME}/git/acme/README.md` }];
    expect(searchTabs('readme', twice, [], HOME).open.map((hit) => hit.id).sort()).toEqual(['t1', 't4']);
  });
});
