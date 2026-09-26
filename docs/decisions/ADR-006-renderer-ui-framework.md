# ADR-006 — Renderer UI: React + React Aria Components for app chrome; documents rendered outside React

- Status: Accepted (2026-09-26, with review amendments)
- Date: 2026-09-25
- Deciders: project owner
- Related: [UX](../design/ux.md) (surfaces, keyboard map, accessibility), [ADR-002](ADR-002-window-and-tab-model.md),
  [ADR-003](ADR-003-rendering-pipeline-and-format-registry.md), [ADR-004](ADR-004-security-and-zero-network.md)

## Context

The renderer has two very different kinds of UI:

1. **App chrome** (small, interactive, accessibility-heavy): tab bar with drag and drop and
   reordering, quick open and command palette (combobox + listbox), find bar, outline, profile
   menu, settings tab, dialogs, status bar. UX sets WCAG 2.2 AA with ARIA tabs, combobox patterns,
   focus traps and restoration, and keyboard-first operation.
2. **Documents** (large, performance-critical): HTML strings from the worker (ADR-003), inserted
   into Shadow DOM containers (ADR-004), warm/hibernated lifecycle (ADR-002), CodeMirror views,
   lazily rendered Mermaid.

The owner works in TypeScript and already works in React. Coding agents are most
reliable in React. Cold start is a PRD target, so the framework's parse and boot cost counts,
but only for the chrome.

## Decision

- **React 19 for the app chrome**, with **React Aria Components** for the accessible primitives:
  tabs/tab list with drag and drop, combobox/listbox for quick open and the palette, dialogs,
  menus, and focus management.
- **Documents are not React-rendered.** A `DocumentHost` component owns a stable DOM node per tab
  and hands it to imperative code: HTML insertion into the Shadow DOM, CodeMirror, Mermaid, and
  the highlight-based find. React never diffs document content, so framework cost does not grow
  with document size or tab count. Mounting is **idempotent** (React StrictMode runs effects twice
  in development; a test covers it).
- **State**: the tab registry is mirrored from main over IPC (ADR-002, ADR-007) into one small
  external store read with `useSyncExternalStore`. UI-only state stays local. No global state
  library until there is a second real need (YAGNI).
- **Styling**: plain CSS with **design tokens as CSS custom properties** and CSS Modules for
  component styles. The stable theming contract for user custom CSS (PRD Open Question 2) is a
  documented set of `--galeo-*` variables and a few semantic `galeo-*` classes on the document
  container. No utility-class framework, because utility class names can't be a stable
  user-facing contract.
- **Styles inside documents**: CSS custom properties inherit into shadow roots, stylesheets don't.
  The document theme and the user's global and profile `custom.css` are **constructable
  stylesheets adopted by every document shadow root** (`adoptedStyleSheets`), so a custom CSS
  change updates all tabs at once.
- **Drag and drop**: React Aria renders drop targets and computes the drop position; it never
  sees file paths. The preload's trusted drop listener (ADR-004) creates the grant and hands the
  page an opaque drop id; the page requests "open drop *id* at position *N*".
- **Frameless window**: the tab bar's empty space is the window drag region
  (`-webkit-app-region: drag`); tabs, buttons and inputs are `no-drag`, so tab drag and drop and
  clicks keep working.
- **Layout by feature**: `renderer/features/{tabs,quick-open,palette,find,outline,profiles,settings,document}`,
  plus shared `renderer/components/` and `renderer/lib/`.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **React 19 + React Aria Components** | Owner familiarity; best agent reliability; React Aria provides tested accessible tabs, combobox, dialogs and drag and drop, matching the UX a11y spec | Larger runtime than the alternatives (tens of KB gzip), paid once at cold start; not used for documents, so no per-document cost | **Chosen** |
| Svelte 5 | Small compiled output; fast | Weaker accessible-component ecosystem (tabs + combobox + drag and drop would be hand-built); agents often mix Svelte 4 and 5 syntax; less owner familiarity | Rejected |
| SolidJS | Tiny, fine-grained, fast | Smaller ecosystem; fewer accessible primitives; less agent familiarity | Rejected |
| Lit / vanilla web components | Minimal runtime; native Shadow DOM | Hand-built accessibility for every widget (the costliest and riskiest part); more custom code | Rejected |

## Consequences

### Positive
- The hardest UX requirements (accessible tabs with drag and drop, combobox, focus management)
  come from a tested library instead of custom code.
- Document performance is independent of the framework.
- One mental model shared with the owner's other React work.

### Negative
- React and React Aria add to the initial bundle. Mitigation: only the chrome loads at start;
  settings, outline and palette are split out and lazy-loaded; the performance harness guards
  the cold-start target.

### Risks
- **React Aria's tab drag and drop may not cover dragging between windows.** Mitigation:
  cross-window moves go through main (ADR-002). The library handles in-window reordering and
  drop targets; the drop from the OS file manager is handled by Electron's drag-and-drop events.

## Revisit triggers
- The cold-start target is missed and profiling points at chrome framework cost.
- React Aria becomes unmaintained.
