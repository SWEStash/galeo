# ADR-038 — Ctrl+H on a reading tab grants edit mode, as Ctrl+E does

- Status: Accepted (2026-11-25, owner)
- Date: 2026-11-25
- Deciders: project owner
- Supersedes: the sentence of [ADR-013](ADR-013-edit-and-save-model.md)'s "Edit grant" that names
  Ctrl+E (or its native menu item) as the only key that grants edit mode. The rest of ADR-013 and all
  of [ADR-015](ADR-015-edit-grant-for-files-the-reader-chose.md) stand.
- Builds on: [ADR-004](ADR-004-security-and-zero-network.md) (capabilities main sees itself),
  [ADR-015](ADR-015-edit-grant-for-files-the-reader-chose.md) (which files can be granted, and main's
  question for the others)
- Issues: [#70](https://github.com/SWEStash/galeo/issues/70)

## Context

Find and replace (Ctrl+H) works only in edit mode, because only the editor's text can be replaced.
While reading, Ctrl+H showed "Find and replace works in edit mode (Ctrl+E)", so the reader had to
press Ctrl+E, then Ctrl+H again. #70 asks for Ctrl+H while reading to turn on edit mode and open
the replace row in one press.

The page can't do this itself. Edit mode is a capability: main grants it only for a key it saw in
its own `before-input-event` hook, or for its native menu item, never for a page message (ADR-004,
ADR-013). Ctrl+H, like every other find key, went to the page.

## Decision

1. **Main sees Ctrl+H first.** Ctrl+H joins the keys main checks in `before-input-event`
   (`GRANTING_COMMANDS` in the keymap). It stays a page command: the palette's *Find and replace*
   still runs in the page, and it grants nothing.
2. **In edit mode the key is the page's.** When the shown tab already has a grant, main lets the key
   through to the page, which opens the replace row as before.
3. **On a reading tab main asks for edit mode as Ctrl+E does.** It applies the same checks:
   - It refuses a file it hasn't read as text with content.
   - It grants a file the reader handed over.
   - It asks in its own dialog about any other file (ADR-015).

   Main takes the key, records the capability key press, and never leaves edit mode for Ctrl+H.
4. **The grant names what follows.** `documents.editMode` carries `replace: true` when the grant
   came from Ctrl+H. The page opens the replace row once the editor shows and has the caret, so the
   find field keeps the focus. A refusal says "This file can't be edited", as it does for Ctrl+E.

## Options considered

| Option | For | Against |
|---|---|---|
| **Main takes Ctrl+H on a reading tab (chosen)** | One press, same checks and dialog as Ctrl+E, the page still asks nothing | One more key in main's hook, and the grant event carries what follows |
| Keep the message | No change to the capability model | Two presses for a common task, and a message where an action was expected |
| Ctrl+H opens find while reading | No ADR change | Replace still needs Ctrl+E first; the key does something different in each mode |
| The page asks main for edit mode on Ctrl+H | Simplest code | Breaks ADR-004: a compromised page could ask for edit mode without a key press |

## Consequences

### Positive

- Ctrl+H does what it says in every mode: it opens replace, and turns on edit mode first when needed.
- The grant still comes only from a real key press main saw, with ADR-015's checks and question.

### Negative

- Main's key hook has a key it sometimes lets through. Its handler answers whether it took the key,
  and the window factory blocks the page from seeing the key only when it did.
- A dialog window, which has no key handler, takes Ctrl+H too. Nothing in those windows uses it.
