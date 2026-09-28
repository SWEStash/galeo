import { describe, expect, it } from 'vitest';
import { tabAction } from './commands';

const view = (active: string | null, ids = ['a', 'b', 'c']) => ({ revision: 1, active, tabs: ids.map((id) => ({ id, path: `/${id}` })) });

describe('tabAction', () => {
  it('moves to the next and previous tab, wrapping around', () => {
    expect(tabAction('nextTab', null, view('b'))).toEqual({ kind: 'activate', id: 'c' });
    expect(tabAction('nextTab', null, view('c'))).toEqual({ kind: 'activate', id: 'a' });
    expect(tabAction('previousTab', null, view('a'))).toEqual({ kind: 'activate', id: 'c' });
  });

  it('goes to tab N, or the last tab', () => {
    expect(tabAction('goToTab', 2, view('a'))).toEqual({ kind: 'activate', id: 'b' });
    expect(tabAction('goToTab', 7, view('a'))).toBeNull();
    expect(tabAction('goToLastTab', null, view('a'))).toEqual({ kind: 'activate', id: 'c' });
  });

  it('moves the active tab left or right, not past the ends', () => {
    expect(tabAction('moveTabLeft', null, view('b'))).toEqual({ kind: 'move', id: 'b', position: 0 });
    expect(tabAction('moveTabRight', null, view('b'))).toEqual({ kind: 'move', id: 'b', position: 2 });
    expect(tabAction('moveTabLeft', null, view('a'))).toBeNull();
    expect(tabAction('moveTabRight', null, view('c'))).toBeNull();
  });

  it('closes the active tab and reopens the last closed one', () => {
    expect(tabAction('closeTab', null, view('b'))).toEqual({ kind: 'close', id: 'b' });
    expect(tabAction('reopenClosed', null, view(null, []))).toEqual({ kind: 'reopen' });
  });

  it('does nothing without an active tab, except reopening', () => {
    for (const command of ['nextTab', 'previousTab', 'goToLastTab', 'moveTabLeft', 'closeTab'] as const) {
      expect(tabAction(command, null, view(null, []))).toBeNull();
    }
  });

  it('ignores commands that are not about tabs', () => {
    expect(tabAction('find', null, view('a'))).toBeNull();
  });
});
