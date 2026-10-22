import { describe, expect, it } from 'vitest';
import type { TabSnapshot } from '../../shared/tabs';
import { forPage } from './page';

const HOME = '/home/me';

describe('forPage', () => {
  it("adds each file tab's format and its folder as the reader sees it", () => {
    const snapshot: TabSnapshot = {
      revision: 3,
      active: 'b',
      tabs: [
        { id: 'a', path: `${HOME}/git/acme/README.md`, zoom: 1.5 },
        { id: 'b', path: '/srv/logs/app.log' },
        { id: 'c', path: `${HOME}/data.csv` },
        { id: 'd', path: `${HOME}/notes` },
      ],
    };
    expect(forPage(snapshot, HOME)).toEqual({
      revision: 3,
      active: 'b',
      tabs: [
        { id: 'a', path: `${HOME}/git/acme/README.md`, zoom: 1.5, format: 'markdown', folder: '~/git/acme' },
        { id: 'b', path: '/srv/logs/app.log', format: 'log', folder: '/srv/logs' },
        { id: 'c', path: `${HOME}/data.csv`, format: 'csv', folder: '~' },
        { id: 'd', path: `${HOME}/notes`, format: 'plain', folder: '~' },
      ],
    });
  });

  it('leaves the settings tab as it is, and the snapshot it was given untouched', () => {
    const snapshot: TabSnapshot = { revision: 1, active: null, tabs: [{ id: 's', path: '', kind: 'settings' }, { id: 'a', path: `${HOME}/a.json` }] };
    const copy = JSON.parse(JSON.stringify(snapshot)) as TabSnapshot;
    expect(forPage(snapshot, HOME).tabs).toEqual([
      { id: 's', path: '', kind: 'settings' },
      { id: 'a', path: `${HOME}/a.json`, format: 'json', folder: '~' },
    ]);
    expect(snapshot).toEqual(copy);
  });
});
