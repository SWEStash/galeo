import { describe, expect, it } from 'vitest';
import { TAB_PANEL_DEFAULT, TAB_PANEL_MAX, TAB_PANEL_MIN } from '../../shared/settings';
import { panelDrag, shownPanelWidth, widthForKey } from './panel-width';

describe('widthForKey', () => {
  it('widens and narrows by 16 px per arrow key, and resets with Home', () => {
    expect(widthForKey(220, 'ArrowRight')).toBe(236);
    expect(widthForKey(220, 'ArrowLeft')).toBe(204);
    expect(widthForKey(300, 'Home')).toBe(TAB_PANEL_DEFAULT);
  });

  it('stays within the minimum and maximum', () => {
    expect(widthForKey(TAB_PANEL_MIN + 4, 'ArrowLeft')).toBe(TAB_PANEL_MIN);
    expect(widthForKey(TAB_PANEL_MAX - 4, 'ArrowRight')).toBe(TAB_PANEL_MAX);
  });

  it('ignores other keys', () => {
    expect(widthForKey(220, 'Enter')).toBeNull();
    expect(widthForKey(220, 'ArrowUp')).toBeNull();
  });
});

describe('panelDrag', () => {
  it('follows the pointer, in whole pixels, between the minimum and the maximum', () => {
    expect(panelDrag(260.6)).toEqual({ collapsed: false, width: 261 });
    expect(panelDrag(120)).toEqual({ collapsed: false, width: TAB_PANEL_MIN });
    expect(panelDrag(900)).toEqual({ collapsed: false, width: TAB_PANEL_MAX });
  });

  it('collapses the panel when dragged under 100 px', () => {
    expect(panelDrag(99)).toEqual({ collapsed: true });
    expect(panelDrag(100)).toEqual({ collapsed: false, width: TAB_PANEL_MIN });
  });
});

describe('shownPanelWidth', () => {
  it('is the stored width while the window has room for it and 320 px of document', () => {
    expect(shownPanelWidth(220, 1200)).toBe(220);
    expect(shownPanelWidth(480, 800)).toBe(480);
  });

  it('draws narrower in a narrow window, never under the minimum', () => {
    expect(shownPanelWidth(480, 700)).toBe(380);
    expect(shownPanelWidth(220, 400)).toBe(TAB_PANEL_MIN);
  });
});
