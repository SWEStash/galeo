/**
 * Home and End move the caret in a search field over a list (the editable combobox pattern, UX §7);
 * the arrows move through the list. react-aria's autocomplete sends Home and End to the list too, so
 * the overlay stops them on the way down (in its capture handler) and the browser moves the caret.
 * Returns whether it kept the key.
 */
export function keepCaretKeys(event: { key: string; stopPropagation(): void }): boolean {
  if (event.key !== 'Home' && event.key !== 'End') return false;
  event.stopPropagation();
  return true;
}
