# ADR-003 — Rendering pipeline (unified/remark/rehype + Shiki, in a worker) and a format registry

- Status: Accepted (2026-09-25, with review amendments); MDX bullet amended in place 2026-10-09
  to match the build (owner), see "Amendment" at the end
- Date: 2026-09-25
- Deciders: project owner
- Related: [ADR-002](ADR-002-window-and-tab-model.md), [ADR-004](ADR-004-security-and-zero-network.md),
  [PRD](../PRD.md), [UX](../design/ux.md) (F9, F10), [Threat model](../security/threat-model.md)
  (SR-02, SR-03, SR-14)

## Context

galeo renders Markdown now and many formats later (txt, log; then JSON, YAML, TOML, CSV,
source code, diagrams). The v0.2 editor must preview articles for an Astro/MDX site faithfully.
Such a site uses remark/rehype, Shiki with the `github-light`/`github-dark` themes, and
remark-math with KaTeX. MDX parsing exists only in the remark/micromark ecosystem.

Rendering must meet the tab-open budget (under 100 ms for about 50 KB of Markdown), stay off the
UI thread (ADR-002), and treat content as hostile (threat model T1, T13).

## Decision

### Markdown pipeline

Built on **unified**, running in a per-window **Web Worker**, producing an HTML string plus
metadata (outline, link set, source positions):

```
remark-parse → remark-gfm → remark-frontmatter → remark-math → (v0.2: remark-mdx for .mdx)
  → remark-rehype (raw HTML kept as nodes) → rehype-raw → rehype-sanitize (allowlist, SR-02)
  → heading slugs + `data-src-line` on block elements → Shiki (@shikijs/rehype, JS regex engine)
  → KaTeX (trust: false, limits) → rehype-stringify
```

- **Sanitize before the trusted generators.** Author-supplied HTML is sanitized. Shiki and KaTeX
  output is produced after sanitizing, from text, by configured libraries (SR-03).
- **Sanitizer schema**: start from the GitHub-style allowlist (keeps `details`/`summary`, `kbd`,
  `sub`/`sup`, `language-*` classes on `code`), then tighten per SR-02: no `style` attributes,
  prefixed ids and names, only `http`/`https`/`mailto`/relative URLs.
- **Shiki** uses its **JavaScript regex engine** (no WebAssembly, so the CSP needs no
  `'wasm-unsafe-eval'`); grammars the engine can't run fall back to plain text. It loads only the
  grammars a document needs and emits **both GitHub themes** (`github-light`/`github-dark`) as
  CSS variables, so light/dark switches without re-rendering. Code blocks over ~200 KB are not
  highlighted.
- **Parse cache**: per-window, bounded LRU keyed by content hash (reused by live reload of
  unchanged content, waking tabs, and view toggles).
- **Mermaid** code blocks become placeholders. The UI thread imports Mermaid lazily
  (`securityLevel: 'strict'`, with `maxTextSize`/`maxEdges` limits), renders a diagram when it
  scrolls into view, sanitizes the SVG, and caches it by content hash. A failing or over-limit
  block shows an inline error (UX states).
- **Local images**: the worker leaves relative `src` values untouched. The Document Host asks main
  to resolve each one (`resolveImage(tabId, src)`); main checks that `src` appears in the image set
  of the document it read itself, and returns an opaque `galeo://file/<id>` URL (ADR-004). Remote
  images become placeholders.
- **Frontmatter** is shown as a collapsible, syntax-highlighted YAML block. It is never parsed
  (no YAML dependency, nothing to exploit).
- **MDX (v0.2):** ESM `import`/`export` is hidden, components become labelled placeholders
  listing their props with their content rendered inside, and `{expressions}` are shown as code
  (comment-only ones are hidden). A lowercase tag whose props are all strings is HTML, handed to
  the same raw-HTML parse and sanitizer as in Markdown. Nothing is ever evaluated.
- **Source positions** (`data-src-line`) go on block-level elements only (paragraphs, headings,
  list items, code blocks, blockquotes, table rows), keeping HTML small and anchors stable. They
  drive scroll anchors (ADR-002), toggling between source and rendered views (UX F10), and v0.2
  split-view scroll sync.

### Source and text views

**CodeMirror 6** is the single component for every non-rendered view: the Markdown source
view, `.txt` in monospace mode, `.log`, unknown text files, and edit mode in v0.2. It only draws
the viewport, which covers the 100 MB-log requirement. It is read-only by default. Language
support is loaded lazily per format. The `.log` view is CodeMirror plus a level-highlighting
decoration and follow-end behaviour.

`.txt` reader mode is a lightweight rendered view: escaped text in the reading column with line
breaks preserved.

### Format registry

Each format is one descriptor. Adding a format means adding a descriptor, not touching the tab
or window code:

```ts
interface FormatDescriptor {
  id: string;                          // 'markdown' | 'mdx' | 'text' | 'log' | …
  match: { extensions: string[]; mime?: string[]; sniff?: (head: Uint8Array) => boolean };
  source: { language?: () => Promise<LanguageSupport> };      // always present
  rendered?: {                                                // optional rendered view
    worker?: () => Promise<WorkerRenderer>;                   //   text → HTML/data, off the UI thread
    host: () => Promise<HostRenderer>;                        //   mounts output in the tab container
  };
  capabilities: { editable: boolean; split: boolean; follow: boolean; outline: boolean };
  limits: { renderMaxBytes: number };                          // above this: source view + banner
}
```

The flow is: detect (extension, then sniff), check binary and encoding, check size, pick the
default view, then load code lazily. Unknown text goes to the plain source view. Binary goes to
the *can't display* state.

### Find in rendered view

In-document search walks the document container's text nodes and highlights matches with the
**CSS Custom Highlight API**. It does not use `webContents.findInPage`, which would also match
app UI and other tabs. The `::highlight()` styles are defined inside each document's shadow root.
The source view uses CodeMirror's search.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **unified (remark/rehype)** | Same ecosystem as Astro, so preview fidelity; the only MDX parser; positions on every node; huge plugin set | Slower than markdown-it; many small packages | **Chosen** |
| markdown-it | Fast, mature, plugin-rich | Different AST and plugins from Astro, so preview drift; no MDX; weaker source positions | Rejected |
| marked | Very fast, small | Weak extensibility and positions; no MDX | Rejected |
| Native parser (comrak, pulldown-cmark) | Fastest | Not in the TypeScript stack (ADR-001); no MDX | Rejected |
| highlight.js / Prism instead of Shiki | Smaller and faster | Different output from Astro (Shiki) | Rejected for Markdown code blocks |
| Monaco instead of CodeMirror 6 | VS Code editor | Heavy (MBs), slower start, weaker handling of huge read-only files | Rejected |

## Consequences

### Positive
- Articles preview with the same parser family, highlighting themes and math as the blog.
- One source component for every format; new formats are cheap (the v0.3 roadmap).
- Parsing in a worker keeps scrolling and tab switching smooth.

### Negative
- unified's speed has to be checked against the 100 ms budget. Mitigation: worker, lazy grammars,
  and caching the parse by content hash.
- Many dependencies (the unified ecosystem is fine-grained). Mitigation: dependency vetting and
  lockfile policy (SR-10).

### Risks
- **Sanitizer schema mistakes.** Mitigation: payload corpus tests (SR-02).
- **Mermaid bundle size and its security history.** Mitigation: lazy import, strict mode, SVG
  sanitizing, pinned version.

## Roadmap note
GitHub-style alerts / Obsidian callouts (`> [!NOTE]`) are common in agent-written docs; a small
own remark plugin can render them later (PRD "Obsidian syntax").

## Revisit triggers
- The performance harness shows the pipeline over budget on typical documents after caching.
- The target site moves to a different Markdown toolchain.

## Amendment (2026-10-09, owner)

The MDX bullet was amended in place to match what v0.2 built (owner's choice for this change; the
convention is a superseding ADR). It first said every JSX element becomes a placeholder. MDX reads
every HTML tag as JSX, so `<img src="a.png">` or `<details>` in an article would have shown as a
box instead of an image or a disclosure. Lowercase tags with only string props now take the
raw-HTML path, so images and links in them work as in Markdown; components, and tags with
`{expression}` props, are still placeholders. Comment-only expressions (`{/* … */}`) are hidden,
as the published site hides them. The MDX parser (with its JavaScript parser) loads in the worker
with the first MDX document.
