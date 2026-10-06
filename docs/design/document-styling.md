# galeo — Document styling contract

- **Status**: First version (2026-09-27), built with the document view; custom CSS loads since 2026-09-29
- **Related**: [UX](ux.md) §6 · [ADR-006](../decisions/ADR-006-renderer-ui-framework.md) ·
  [Threat model](../security/threat-model.md) SR-17

Documents render inside a shadow root, isolated from the app's own styles. They inherit a small
set of CSS custom properties from the app, and those properties, plus the classes below, are the
stable surface a `custom.css` can rely on. Anything else in the markup may change between
releases.

## Where custom CSS applies

- `custom.css` in the config folder applies to every profile; `profiles/<id>/custom.css` to one
  profile, after the global file. "Open CSS" in the Settings tab creates either and opens it in
  your editor; saving applies it to every open document at once.
- It styles documents only: the tab bar, status bar and other app chrome keep their own styles.
- `@import` is ignored, and the page's policy refuses remote files, so custom CSS can't load
  anything from the network (use `data:` URLs for small images). A file over 1 MiB, or not UTF-8,
  is left as it is: the last good CSS stays and a notice names the file.

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
| `--galeo-color-log-error` | `#d1242f` / `#f85149` | Log error badges and line tint |
| `--galeo-color-log-warn` | `#9a6700` / `#d29922` | Log warning badges and line tint |
| `--galeo-color-log-info` | `#0969da` / `#4493f8` | Log info badges |

The fonts ship with the app (no web fonts), each with a system fallback.

## Classes and attributes

| Selector | What it is |
|---|---|
| `.galeo-document` | The document's reading column (inside the shadow root) |
| `:host([data-scheme='dark'])` | The document while the app is dark; code highlighting switches on it |
| `.galeo-frontmatter` | The collapsible frontmatter block |
| `.galeo-remote-image` | Placeholder for a blocked remote image (`data-host`, `data-url`) |
| `.galeo-text-reader` | The `.txt` reader view (paragraphs keep their line breaks) |
| `.galeo-diagram` | A Mermaid diagram's block (`data-state`: `pending`, `rendered`, `error`); the SVG is in a shadow root of its own |

Code blocks are highlighted with the `github-light` and `github-dark` themes, emitted as
`--shiki-light` / `--shiki-dark` variables on each token. The few theme colours that read below
4.5:1 on a code block are replaced by GitHub's current, darker (or, in dark, lighter) shades.

Diagrams draw at Mermaid's natural size, where labels are about the body text's size, and are
never enlarged. A diagram wider than the column shrinks to fit, down to 75 %; past that it keeps
that size and its block scrolls sideways (and takes keyboard focus, so arrow keys scroll it).
In dark mode, a diagram whose source sets its own colours (`style`, `classDef` or `linkStyle` with
a fill, colour or stroke) is drawn with the light theme on a white panel
(`.galeo-diagram[data-panel='light']`), as its author chose those colours for a light page; the
viewer keeps the panel.
