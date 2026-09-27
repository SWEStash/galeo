# galeo — Document styling contract

- **Status**: First version (2026-09-27), built with the document view
- **Related**: [UX](ux.md) §6 · [ADR-006](../decisions/ADR-006-renderer-ui-framework.md) ·
  [Threat model](../security/threat-model.md) SR-17

Documents render inside a shadow root, isolated from the app's own styles. They inherit a small
set of CSS custom properties from the app, and those properties, plus the classes below, are the
stable surface a `custom.css` can rely on. Anything else in the markup may change between
releases.

## Tokens

Defined on `:root`; the dark values apply when the root element has `data-scheme="dark"`.

| Token | Default (light / dark) | Use |
|---|---|---|
| `--galeo-font-prose` | Inter | Body text |
| `--galeo-font-serif` | Source Serif 4 | Optional serif prose font |
| `--galeo-font-code` | JetBrains Mono | Code, source and log views |
| `--galeo-font-ui` | Inter | App chrome |
| `--galeo-font-size` | `17px` | Body text size |
| `--galeo-line-height` | `1.6` | Body line height |
| `--galeo-measure` | `72ch` | Reading column width |
| `--galeo-code-size` | `0.9em` | Code size relative to the text around it |
| `--galeo-space-block` | `1em` | Space after paragraphs, lists, tables and code blocks |
| `--galeo-radius` | `6px` | Code block corners |
| `--galeo-color-bg` | `#ffffff` / `#0d1117` | Page background |
| `--galeo-color-fg` | `#1f2328` / `#e6edf3` | Text |
| `--galeo-color-muted` | `#59636e` / `#9198a1` | Quotes, captions, placeholders |
| `--galeo-color-border` | `#d1d9e0` / `#3d444d` | Rules, table borders |
| `--galeo-color-link` | `#0969da` / `#4493f8` | Links |
| `--galeo-color-code-bg` | `#f6f8fa` / `#161b22` | Code block and inline code background |
| `--galeo-color-focus` | `#0969da` / `#4493f8` | Focus ring |
| `--galeo-color-mark` | yellow, 45% | Find matches |
| `--galeo-color-mark-current` | orange | The current find match |

The fonts ship with the app (no web fonts), each with a system fallback.

## Classes and attributes

| Selector | What it is |
|---|---|
| `.galeo-document` | The document's reading column (inside the shadow root) |
| `:host([data-scheme='dark'])` | The document while the app is dark; code highlighting switches on it |
| `.galeo-frontmatter` | The collapsible frontmatter block |
| `.galeo-remote-image` | Placeholder for a blocked remote image (`data-host`, `data-url`) |

Code blocks are highlighted with the `github-light` and `github-dark` themes, emitted as
`--shiki-light` / `--shiki-dark` variables on each token.
