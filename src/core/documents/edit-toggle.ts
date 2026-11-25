/** What Ctrl+E does to a tab (ADR-015). */
type EditToggle = 'leave' | GrantAsked;
/** What asking for edit mode on a reading tab does (ADR-015). */
type GrantAsked = 'refuse' | 'grant' | 'ask';

/**
 * `granted`: the tab is in edit mode. `text`: main last read the tab's file as text with content.
 * `chosen`: the reader handed that file over, or confirmed editing it.
 */
interface EditState {
  granted: boolean;
  text: boolean;
  chosen: boolean;
}

function askGrant({ text, chosen }: EditState): GrantAsked {
  if (!text) return 'refuse';
  return chosen ? 'grant' : 'ask';
}

export function editToggle(state: EditState): EditToggle {
  return state.granted ? 'leave' : askGrant(state);
}

/**
 * What Ctrl+H does to a tab (ADR-038): in edit mode it is the page's key (replace opens there); on a
 * reading tab it asks for edit mode as Ctrl+E does, and the page opens replace once granted. It
 * never leaves edit mode.
 */
export function replaceKey(state: EditState): 'page' | GrantAsked {
  return state.granted ? 'page' : askGrant(state);
}
