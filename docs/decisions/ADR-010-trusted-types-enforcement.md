# ADR-010 — Trusted Types enforced in every build, with three library policies

- Status: Accepted (2026-10-05)
- Date: 2026-10-05
- Deciders: project owner
- Supersedes: the Trusted Types clause of [ADR-004](ADR-004-security-and-zero-network.md) "Inert
  content": *development builds run Trusted Types in report-only mode … release builds enforce it
  from v0.1, and any library exception needed is recorded in this ADR*. The rest of ADR-004
  stands.
- Related: [Threat model](../security/threat-model.md) (SR-02, SR-03, T1, T4),
  [ADR-003](ADR-003-rendering-pipeline-and-format-registry.md) (Mermaid, the render worker)

## Context

ADR-004 planned one Trusted Types policy, `galeo-document`, through which the Document Host inserts
all HTML, with report-only mode in development to find library exceptions before release builds
enforced it. Until then, release builds sent no Trusted Types header at all, and development builds
reported three violations:

1. **The render worker's script URL.** Vite emits `new Worker(new URL(…))`; under
   `require-trusted-types-for 'script'` a `Worker` needs a `TrustedScriptURL`.
2. **DOMPurify's own policy.** DOMPurify, which Mermaid uses inside and our SVG pass uses,
   creates a policy named `dompurify` and parses markup strings through it. Without it, its
   parsing falls through to whatever else is allowed and is refused.
3. **Mermaid's text assignments.** Mermaid sets its generated CSS with `style.innerHTML = …` and
   clears containers with `innerHTML = ''`. Neither goes through a policy we can supply.

## Decision

Every app page is served with Trusted Types **enforced**, in packaged and unpackaged builds alike
(so the e2e suite runs under the same rules as releases):

`require-trusted-types-for 'script'; trusted-types galeo-document galeo-worker dompurify default`

No other policy name can be created, and `allow-duplicates` is not set.

| Policy | Created by | What it lets through |
|---|---|---|
| `galeo-document` | Document Host | Worker-sanitized document HTML and our sanitized diagram SVG (unchanged from ADR-004) |
| `galeo-worker` | the page | `createScriptURL` for the render worker: same-origin URLs only; `blob:`, `data:` and other origins throw |
| `dompurify` | DOMPurify | DOMPurify's own sanitized output. The library is pinned and on the watch list (SR-09) |
| `default` | the page, at startup | `createHTML` for strings **with no `<`**: text, which can create no element (as `textContent` would). Any string with markup is refused |

The worker is imported as `render.worker.ts?worker&url` and constructed with
`new Worker(workerScriptUrl(url))`.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Enforce with the policies above | Every HTML or script-URL sink with markup goes through a named, reviewed policy; tests run enforced | Two library exceptions (`dompurify`, `default`) | **Chosen** |
| A `default` policy that sanitizes any string | No reliance on "no markup" | Hides which code inserts HTML; a second sanitizer to keep in step | Rejected |
| Patch Mermaid to use `textContent` | No `default` policy | A fork of a pinned dependency to maintain at every upgrade | Rejected |
| Keep report-only in v0.1 | No risk of a refused sink in a path the tests miss | Release builds without the layer ADR-004 promised | Rejected |

## Consequences

### Positive
- A content exploit that reaches an HTML sink with markup is refused by the browser, in every
  build, not only reported.
- The e2e suite runs enforced; a new sink in our code or a library update fails a test.

### Negative
- `default` accepts markup-free strings from any code. That is by design no more than text.
- `dompurify` trusts DOMPurify's output wherever DOMPurify is called, including inside Mermaid.

### Risks
- **A sink only some document reaches** (a rarely used Mermaid diagram type) is refused in use.
  Mitigation: the diagram fixtures cover the types we test; a refused Mermaid sink shows that
  diagram's error box, not a broken window.
- **A library update adds a markup sink.** Mitigation: the e2e "no violation" test across
  documents, diagrams, math, logs, source view and the overlays.

## Revisit triggers
- Mermaid stops writing `innerHTML` (the `default` policy may go).
- A new library needs a policy: add it here, never by widening `default`.
