import { useCallback, useEffect, useState } from 'react';
import { TAB_PANEL_DEFAULT, type TabsPosition } from '../../shared/settings';
import { useCommands } from '../commands/useCommands';

/**
 * Where this window shows its tabs (ADR-023): the profile's setting, and whether the side panel is
 * collapsed here, which lasts until the window closes. The palette moves the tabs, Ctrl+Shift+B
 * collapses and expands the panel.
 */
export function useTabsPosition(position: TabsPosition | undefined, width: number | undefined, say: (message: string) => void) {
  const tabsLeft = position === 'left';
  const [collapsed, setCollapsed] = useState(false);
  // Back to the tab bar and to the left again: the panel shows expanded.
  useEffect(() => {
    if (!tabsLeft) setCollapsed(false);
  }, [tabsLeft]);
  const keep = useCallback(
    (change: { tabsPosition: TabsPosition } | { tabPanelWidth: number }) =>
      void window.galeo.settings.set('profile', change).then((result) => {
        if (!result.ok) say("Not kept: this profile's profile.json has an error from a hand edit");
      }),
    [say],
  );
  useCommands({
    toggleTabPanel: () => {
      if (!tabsLeft) say('The tab panel shows only with tabs on the left');
      else {
        setCollapsed(!collapsed);
        say(collapsed ? 'Tab panel expanded' : 'Tab panel collapsed');
      }
      return true;
    },
    tabsOnLeft: () => (keep({ tabsPosition: 'left' }), true),
    tabsOnTop: () => (keep({ tabsPosition: 'top' }), true),
  });
  const keepPanelWidth = useCallback((tabPanelWidth: number) => keep({ tabPanelWidth }), [keep]);
  return { tabsLeft, panelWidth: width ?? TAB_PANEL_DEFAULT, collapsed, setCollapsed, keepPanelWidth };
}
