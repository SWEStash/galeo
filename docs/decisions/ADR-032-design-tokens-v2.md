# ADR-032 — Design tokens v2: the chrome's own scale, and renames

- Status: Accepted (2026-11-05, owner)
- Date: 2026-11-05
- Deciders: project owner
- Builds on: [ADR-006](ADR-006-renderer-ui-framework.md) (plain CSS with design tokens; `custom.css`
  adopted by every document's shadow root). Supersedes ADR-006's word **"stable"** for the documented
  `--galeo-*` names (the rename rule below); the rest of ADR-006 stands.

## Context

v0.7 refreshes the look of the interface around the document ([visual-refresh.md](../design/visual-refresh.md)).
Today the chrome has no tokens of its own:

- It draws with the documented document tokens (`--galeo-color-code-bg` for the tab bar,
  `--galeo-radius`, documented as the code block corner, 13 times) and with literal sizes: 11 text
  sizes, 10 spacing values, 4 shadows.
- A user's `custom.css` is adopted into document shadow roots only (`src/renderer/document/host.ts`),
  so it never restyles the chrome. Tokens set on the page's root still inherit into documents, so a
  `custom.css` can *read* any of them.
- ADR-006 calls the documented `--galeo-*` set "the stable theming contract". The owner allowed
  breaking renames for v0.7 (2026-11-05), so that word needs a rule in its place.

## Decision

1. **The chrome gets its own scale** in `src/renderer/styles/tokens.css`: `--galeo-space-*`,
   `--galeo-text-*`, `--galeo-radius-{sm,md,lg,full}`, `--galeo-shadow-{1,2}`, `--galeo-scrim`,
   `--galeo-chrome-*` colours and `--galeo-motion-*` / `--galeo-ease`, with the values in
   visual-refresh.md §2. `app.css` uses these and no literal sizes, colours or shadows outside a
   short, commented allow-list (a check in `npm run check` keeps it so).
2. **Chrome tokens are internal.** They are not in [document-styling.md](../design/document-styling.md),
   and they may change in any release. A document may see them through inheritance; a `custom.css`
   that uses them gets no promise.
3. **Document tokens stay the contract.** The `--galeo-*` names and `galeo-*` classes listed in
   document-styling.md keep working. The chrome stops reading them where it has its own token
   (`--galeo-radius` goes back to meaning code block corners only).
4. **Renames (replaces "stable").** A documented name may be renamed or removed in a minor release
   when it buys clarity, if the release notes and document-styling.md list the old name and its
   replacement. No aliases are kept. A name is never reused with a different meaning.
5. **v0.7 renames nothing** in the documented set: the refresh needs only new internal tokens. The
   rule above applies from v0.7 on.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Internal chrome tokens; documented set kept; rename rule replaces "stable"** | Chrome can change freely; no reader's `custom.css` breaks in v0.7; the owner's rename allowance becomes a rule | Two token families to keep apart | **Chosen** |
| Document the chrome tokens too | One list | Every chrome tweak becomes a contract change, for styles `custom.css` can't apply to the chrome anyway | Rejected |
| Rename the document tokens into the new scheme now | One naming scheme | Breaks readers' `custom.css` for no visible gain | Rejected (allowed by point 4, not needed) |
| Keep "stable", aliases forever | Nothing ever breaks | Names can never improve; aliases pile up | Rejected (owner, 2026-11-05) |

## Consequences

- ADR-006's "stable theming contract" now means "documented, renamed only with notice" (point 4).
- document-styling.md gains a short paragraph with the rename rule and stops listing anything the
  chrome uses.
- A theme change for the chrome is a `tokens.css` change plus the contrast test
  (`tests/unit/design/colour-contrast.test.ts` gains the `--galeo-chrome-*` pairs).
